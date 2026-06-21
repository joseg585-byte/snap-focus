-- =============================================================
-- SnapFocus — Migration 0004
-- V3 kid-focus pivot: Room Check -> Clean Check (+ areas), new
-- Homework Check tool, Standard Tutor -> Study Quiz.
-- Renaming enum values keeps existing rows' history intact instead
-- of forking the data model.
-- =============================================================

-- ---------- ENUM RENAMES ----------
alter type ai_action rename value 'room_check' to 'clean_check';
alter type ai_action rename value 'standard_tutor' to 'study_quiz';
alter type ai_action add value if not exists 'homework_check';

alter type credit_reason rename value 'room_check' to 'clean_check';
alter type credit_reason rename value 'standard_tutor' to 'study_quiz';
alter type credit_reason add value if not exists 'homework_check';

-- ---------- CLEAN CHECK: area picker ----------
-- Existing rows predate the area picker and were always a bedroom check.
alter table public.room_checks
  add column if not exists area text not null default 'bedroom';

-- ---------- HOMEWORK CHECK: new tool ----------
create table public.homework_checks (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  storage_path    text not null,                -- path in the 'homework-checks' bucket
  verdict         text not null check (verdict in ('pass', 'fail', 'not_homework')),
  ai_feedback     text,
  -- [{ question_ref, issue }] — only populated when verdict = 'fail'
  issues          jsonb not null default '[]',
  credits_spent   integer not null default 3,
  created_at      timestamptz not null default now()
);

create index idx_homework_checks_user on public.homework_checks(user_id, created_at desc);

alter table public.homework_checks enable row level security;

create policy "homework_checks_select_own" on public.homework_checks
  for select using (auth.uid() = user_id);
create policy "homework_checks_insert_own" on public.homework_checks
  for insert with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('homework-checks', 'homework-checks', false)
on conflict (id) do nothing;

create policy "homework_checks_storage_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'homework-checks'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "homework_checks_storage_select_own" on storage.objects
  for select using (
    bucket_id = 'homework-checks'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------- CREDIT LOGIC: V3 pricing ----------
-- clean_check: unchanged (1/3/6 via p_cost_override). study_quiz: 12 -> 8
-- flat (timer + auto-generated 5-question quiz, no per-question retries).
-- homework_check: new, 3 flat.
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
              when 'clean_check'     then 1
              when 'study_quiz'      then 8
              when 'master_coach'    then 10
              when 'homework_check'  then 3
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
