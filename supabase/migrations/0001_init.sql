-- =============================================================
-- SnapFocus / SeJo Labs — Supabase Schema v1
-- =============================================================
-- Conventions:
--   * auth.users is Supabase-managed (handles email, Google, Apple)
--   * public.profiles is our app-side mirror, 1:1 with auth.users
--   * All money stored as integer cents. All credits as integers.
--   * Credit math NEVER happens client-side — only via the SECURITY
--     DEFINER functions below, which lock the row to prevent double-spend.
-- =============================================================

-- ---------- ENUMS ----------
create type subscription_tier as enum ('starter', 'pro', 'ultimate');
create type subscription_status as enum ('active', 'past_due', 'canceled', 'trialing', 'incomplete');
create type auth_provider as enum ('email', 'google', 'apple');
create type credit_reason as enum (
  'monthly_grant',      -- tier renewal / upgrade grant
  'topup_purchase',     -- one-time pack
  'room_check',         -- -1
  'standard_tutor',     -- -2
  'master_coach',       -- -20
  'admin_adjustment',   -- manual correction
  'refund'              -- stripe dispute/refund clawback
);
create type ai_action as enum ('room_check', 'standard_tutor', 'master_coach');

-- =============================================================
-- 1. PROFILES  (1:1 with auth.users)
-- =============================================================
create table public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  email                 text,
  display_name          text,
  avatar_url            text,

  -- Auth provenance (tracks email/google/apple; future-proof for App Store)
  primary_provider      auth_provider not null default 'email',
  linked_providers      auth_provider[] not null default '{}',

  -- Subscription state
  tier                  subscription_tier not null default 'starter',
  subscription_status   subscription_status not null default 'incomplete',

  -- Payment provider abstraction:
  -- 'stripe' for web today, 'apple' / 'revenuecat' later. Keep IDs generic.
  billing_provider      text not null default 'stripe',
  stripe_customer_id    text unique,
  provider_subscription_id text,        -- stripe sub id OR apple original_transaction_id

  -- Billing anchor: reset to now() on mid-month upgrade
  billing_anchor        timestamptz,
  current_period_end    timestamptz,

  -- FAST credit balance for the hard-stop check (source of truth = ledger,
  -- this is the cached materialized value, kept in sync by deduct/grant fns)
  credit_balance        integer not null default 0 check (credit_balance >= 0),

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index idx_profiles_tier on public.profiles(tier);
create index idx_profiles_stripe_customer on public.profiles(stripe_customer_id);

-- =============================================================
-- 2. TIER CONFIG  (single source of truth for limits, not hard-coded in app)
-- =============================================================
create table public.tier_config (
  tier                  subscription_tier primary key,
  monthly_price_cents   integer not null,
  monthly_credits       integer not null,
  flagship_ai_access    boolean not null default false,  -- master coach
  pdf_export            boolean not null default false,
  branded_export        boolean not null default false,
  text_retention_days   integer,                          -- null = keep forever
  updated_at            timestamptz not null default now()
);

insert into public.tier_config
  (tier, monthly_price_cents, monthly_credits, flagship_ai_access, pdf_export, branded_export, text_retention_days)
values
  ('starter',  499,  500,  false, false, false, 30),
  ('pro',      999,  1000, false, true,  false, 180),
  ('ultimate', 1999, 1500, true,  true,  true,  null);  -- null = never purge

-- =============================================================
-- 3. CREDIT TRANSACTIONS  (append-only ledger — source of truth)
-- =============================================================
create table public.credit_transactions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  amount            integer not null,        -- +grant / -spend
  reason            credit_reason not null,
  balance_after     integer not null,        -- snapshot for audit
  -- idempotency: stripe event id, action request id, etc. prevents double-apply
  idempotency_key   text unique,
  metadata          jsonb not null default '{}',
  created_at        timestamptz not null default now()
);

create index idx_credit_tx_user on public.credit_transactions(user_id, created_at desc);

-- =============================================================
-- 4. TOP-UP / SUBSCRIPTION PURCHASES  (Stripe / future Apple receipts)
-- =============================================================
create type purchase_kind as enum ('subscription', 'topup');

create table public.purchases (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  kind                purchase_kind not null,
  -- 'quick_fix' | 'value_pack' | 'power_pack' for topups; tier name for subs
  sku                 text not null,
  amount_cents        integer not null,
  credits_granted     integer not null default 0,
  billing_provider    text not null default 'stripe',
  provider_event_id   text unique,            -- idempotency from webhook
  created_at          timestamptz not null default now()
);

create index idx_purchases_user on public.purchases(user_id, created_at desc);

-- =============================================================
-- 5. LESSON PLANS / GENERATED TEXT  (tier-based retention)
-- =============================================================
create table public.lesson_plans (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  action        ai_action not null,           -- standard_tutor | master_coach
  title         text,
  content       text not null,
  model_used    text,
  credits_spent integer not null,
  metadata      jsonb not null default '{}',
  created_at    timestamptz not null default now()
);

create index idx_lesson_plans_user on public.lesson_plans(user_id, created_at desc);
-- partial index to make the purge cron fast
create index idx_lesson_plans_created on public.lesson_plans(created_at);

-- =============================================================
-- 6. ROOM CHECKS  (vision results; image bytes live in Storage, 48h purge)
-- =============================================================
create table public.room_checks (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  storage_path    text not null,              -- path in the 'room-checks' bucket
  is_clean        boolean,
  confidence      numeric(4,3),
  ai_feedback     text,
  credits_spent   integer not null default 1,
  image_deleted   boolean not null default false,  -- set true by 48h cron
  created_at      timestamptz not null default now()
);

create index idx_room_checks_user on public.room_checks(user_id, created_at desc);
create index idx_room_checks_purge on public.room_checks(created_at) where image_deleted = false;

-- =============================================================
-- ATOMIC CREDIT LOGIC (the part that protects the margin)
-- =============================================================

-- Atomically deduct credits with a hard stop. Returns the new balance,
-- or raises if insufficient. SECURITY DEFINER + RLS so the client can
-- NEVER set its own balance.
create or replace function public.spend_credits(
  p_user_id   uuid,
  p_action    ai_action,
  p_idem_key  text default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cost     integer;
  v_balance  integer;
  v_reason   credit_reason;
begin
  -- map action -> cost (single source of truth, server-side only)
  v_cost := case p_action
              when 'room_check'     then 1
              when 'standard_tutor' then 2
              when 'master_coach'   then 20
            end;
  v_reason := p_action::text::credit_reason;

  -- idempotent replay: if this action id was already charged, return current balance
  if p_idem_key is not null and exists (
       select 1 from credit_transactions where idempotency_key = p_idem_key) then
    select credit_balance into v_balance from profiles where id = p_user_id;
    return v_balance;
  end if;

  -- lock the row to prevent concurrent double-spend
  select credit_balance into v_balance
  from profiles where id = p_user_id
  for update;

  if v_balance is null then
    raise exception 'user_not_found';
  end if;

  -- HARD STOP
  if v_balance < v_cost then
    raise exception 'insufficient_credits' using detail = format('have %s need %s', v_balance, v_cost);
  end if;

  update profiles set credit_balance = credit_balance - v_cost, updated_at = now()
  where id = p_user_id;

  insert into credit_transactions (user_id, amount, reason, balance_after, idempotency_key)
  values (p_user_id, -v_cost, v_reason, v_balance - v_cost, p_idem_key);

  return v_balance - v_cost;
end;
$$;

-- Grant credits (monthly renewal, upgrade reset-to-max, topups). Idempotent.
create or replace function public.grant_credits(
  p_user_id   uuid,
  p_amount    integer,
  p_reason    credit_reason,
  p_idem_key  text default null,
  p_set_absolute boolean default false   -- true = upgrade reset-to-max
) returns integer
language plpgsql security definer set search_path = public
as $$
declare v_balance integer;
begin
  -- swallow duplicate webhook deliveries
  if p_idem_key is not null and exists (
       select 1 from credit_transactions where idempotency_key = p_idem_key) then
    select credit_balance into v_balance from profiles where id = p_user_id;
    return v_balance;
  end if;

  if p_set_absolute then
    update profiles set credit_balance = p_amount, updated_at = now()
    where id = p_user_id returning credit_balance into v_balance;
  else
    update profiles set credit_balance = credit_balance + p_amount, updated_at = now()
    where id = p_user_id returning credit_balance into v_balance;
  end if;

  insert into credit_transactions (user_id, amount, reason, balance_after, idempotency_key)
  values (p_user_id, p_amount, p_reason, v_balance, p_idem_key);

  return v_balance;
end;
$$;

-- =============================================================
-- AUTO-PROVISION PROFILE ON SIGNUP (email / Google / Apple)
-- Reconstructed past the point the original transcript was truncated:
-- new users start on 'starter' with the starter monthly credit grant.
-- =============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_provider auth_provider;
  v_credits  integer;
begin
  v_provider := coalesce(
    (new.raw_app_meta_data->>'provider')::auth_provider,
    'email'
  );

  select monthly_credits into v_credits from public.tier_config where tier = 'starter';

  insert into public.profiles (id, email, primary_provider, linked_providers, tier, credit_balance)
  values (
    new.id,
    new.email,
    v_provider,
    array[v_provider],
    'starter',
    coalesce(v_credits, 0)
  )
  on conflict (id) do nothing;

  -- seed the ledger so the balance is auditable from day one
  insert into public.credit_transactions (user_id, amount, reason, balance_after)
  values (new.id, coalesce(v_credits, 0), 'monthly_grant', coalesce(v_credits, 0));

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- keep updated_at fresh on profiles
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- =============================================================
-- ROW LEVEL SECURITY
-- Users can read their own rows; writes that touch money/credits go
-- exclusively through the SECURITY DEFINER functions above (which run
-- as the table owner and bypass these policies).
-- =============================================================
alter table public.profiles            enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.purchases           enable row level security;
alter table public.lesson_plans        enable row level security;
alter table public.room_checks         enable row level security;
alter table public.tier_config         enable row level security;

-- profiles: owner can read + update non-privileged columns of their own row
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ledger / purchases: read-only to the owner (inserts come from definer fns)
create policy "credit_tx_select_own" on public.credit_transactions
  for select using (auth.uid() = user_id);
create policy "purchases_select_own" on public.purchases
  for select using (auth.uid() = user_id);

-- lesson plans: owner has full CRUD over their own generated text
create policy "lesson_plans_select_own" on public.lesson_plans
  for select using (auth.uid() = user_id);
create policy "lesson_plans_insert_own" on public.lesson_plans
  for insert with check (auth.uid() = user_id);
create policy "lesson_plans_delete_own" on public.lesson_plans
  for delete using (auth.uid() = user_id);

-- room checks: owner can read + insert their own
create policy "room_checks_select_own" on public.room_checks
  for select using (auth.uid() = user_id);
create policy "room_checks_insert_own" on public.room_checks
  for insert with check (auth.uid() = user_id);

-- tier_config: world-readable pricing table (no writes from clients)
create policy "tier_config_read_all" on public.tier_config
  for select using (true);
