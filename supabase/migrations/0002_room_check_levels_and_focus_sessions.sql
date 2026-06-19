-- =============================================================
-- SnapFocus — Migration 0002
-- Additive only: Room Check verification levels, Master Focus Coach
-- sessions, and the Storage bucket Room Check photos live in.
-- =============================================================

-- ---------- ROOM CHECK: verification levels ----------
create type room_check_level as enum ('quick', 'standard', 'deep');

alter table public.room_checks
  add column if not exists level room_check_level not null default 'quick',
  add column if not exists storage_paths text[] not null default '{}',
  add column if not exists area_results jsonb not null default '[]',
  add column if not exists overall_pass boolean;

-- storage_path (singular) predates multi-photo levels; keep it nullable so
-- new rows can rely on storage_paths exclusively.
alter table public.room_checks
  alter column storage_path drop not null;

-- ---------- CREDIT LOGIC: per-level cost override ----------
-- Room Check now costs 1/2/3 credits depending on level. spend_credits()
-- still defaults to the action's flat cost (room_check = 1) for callers
-- that don't pass an override, so /api/tutor and /api/master-coach are
-- untouched.
create or replace function public.spend_credits(
  p_user_id   uuid,
  p_action    ai_action,
  p_idem_key  text default null,
  p_cost_override integer default null
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
  v_cost := coalesce(p_cost_override, case p_action
              when 'room_check'     then 1
              when 'standard_tutor' then 2
              when 'master_coach'   then 20
            end);
  v_reason := p_action::text::credit_reason;

  if p_idem_key is not null and exists (
       select 1 from credit_transactions where idempotency_key = p_idem_key) then
    select credit_balance into v_balance from profiles where id = p_user_id;
    return v_balance;
  end if;

  select credit_balance into v_balance
  from profiles where id = p_user_id
  for update;

  if v_balance is null then
    raise exception 'user_not_found';
  end if;

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

-- ---------- MASTER FOCUS COACH: session transcripts ----------
create table public.focus_sessions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  goal              text not null,
  duration_minutes  integer not null,
  focus_level       text not null check (focus_level in ('light', 'heavy')),
  -- [{ role: 'coach'|'user', text, at }], appended as the session runs
  transcript        jsonb not null default '[]',
  reflection        text,
  credits_spent     integer not null default 20,
  completed_at      timestamptz,
  created_at        timestamptz not null default now()
);

create index idx_focus_sessions_user on public.focus_sessions(user_id, created_at desc);

alter table public.focus_sessions enable row level security;

create policy "focus_sessions_select_own" on public.focus_sessions
  for select using (auth.uid() = user_id);
create policy "focus_sessions_insert_own" on public.focus_sessions
  for insert with check (auth.uid() = user_id);
create policy "focus_sessions_update_own" on public.focus_sessions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- STORAGE: room-checks bucket ----------
-- Private bucket; photos are addressed by signed URL, never public. Path
-- convention: {user_id}/{room_check_id}/{n}.jpg — owner-prefixed so the
-- policies below can authorize purely from the path.
insert into storage.buckets (id, name, public)
values ('room-checks', 'room-checks', false)
on conflict (id) do nothing;

create policy "room_checks_storage_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'room-checks'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "room_checks_storage_select_own" on storage.objects
  for select using (
    bucket_id = 'room-checks'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "room_checks_storage_delete_own" on storage.objects
  for delete using (
    bucket_id = 'room-checks'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
