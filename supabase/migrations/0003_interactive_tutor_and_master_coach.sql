-- =============================================================
-- SnapFocus — Migration 0003
-- Interactive Standard Tutor (graded Q&A) + Master Study Coach
-- (subject-matter coaching with persistent knowledge state).
-- Additive only.
-- =============================================================

-- ---------- STANDARD TUTOR: structured questions ----------
alter table public.lesson_plans
  add column if not exists questions jsonb not null default '[]';
-- questions shape: [{ prompt, correct_answer, solution_path }]

create table public.lesson_attempts (
  id              uuid primary key default gen_random_uuid(),
  lesson_id       uuid not null references public.lesson_plans(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  question_index  integer not null,
  attempt_number  integer not null,
  work_shown      text,
  answer          text,
  ai_grade_result jsonb not null default '{}',
  feedback        text,
  created_at      timestamptz not null default now()
);

create index idx_lesson_attempts_lesson on public.lesson_attempts(lesson_id, question_index, created_at);
create index idx_lesson_attempts_user on public.lesson_attempts(user_id, created_at desc);

alter table public.lesson_attempts enable row level security;

create policy "lesson_attempts_select_own" on public.lesson_attempts
  for select using (auth.uid() = user_id);
create policy "lesson_attempts_insert_own" on public.lesson_attempts
  for insert with check (auth.uid() = user_id);

-- ---------- MASTER STUDY COACH: persistent knowledge state ----------
create table public.study_topics (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  subject         text not null,
  last_studied_at timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

-- one topic row per user+subject (case-insensitive) so repeat sessions on the
-- same free-text subject accumulate knowledge instead of fragmenting
create unique index idx_study_topics_user_subject on public.study_topics(user_id, lower(subject));

create table public.study_knowledge (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  topic_id          uuid not null references public.study_topics(id) on delete cascade,
  concept           text not null,
  mastery_level     integer not null default 1 check (mastery_level between 1 and 5),
  last_practiced_at timestamptz not null default now(),
  attempts          integer not null default 0,
  correct_attempts  integer not null default 0,
  created_at        timestamptz not null default now()
);

create unique index idx_study_knowledge_topic_concept on public.study_knowledge(topic_id, lower(concept));
create index idx_study_knowledge_user on public.study_knowledge(user_id, mastery_level);

alter table public.study_topics    enable row level security;
alter table public.study_knowledge enable row level security;

create policy "study_topics_select_own" on public.study_topics
  for select using (auth.uid() = user_id);
create policy "study_topics_insert_own" on public.study_topics
  for insert with check (auth.uid() = user_id);
create policy "study_topics_update_own" on public.study_topics
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "study_knowledge_select_own" on public.study_knowledge
  for select using (auth.uid() = user_id);
create policy "study_knowledge_insert_own" on public.study_knowledge
  for insert with check (auth.uid() = user_id);
create policy "study_knowledge_update_own" on public.study_knowledge
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- FOCUS SESSIONS: coached mode vs. just-focus, plan + report ----------
alter table public.focus_sessions
  add column if not exists mode text not null default 'just_focus' check (mode in ('coached', 'just_focus')),
  add column if not exists subject text,
  add column if not exists session_plan jsonb not null default '[]',
  add column if not exists end_report jsonb;

-- ---------- CREDIT LOGIC: updated pricing ----------
-- standard_tutor: 2 -> 12 (now all-inclusive: generation + grading + up to 3
-- retries/question). master_coach: 20 -> 10 default (Master Study Coach,
-- coached mode); routes pass p_cost_override = 5 for the "Just Focus" sub-mode.
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
              when 'standard_tutor' then 12
              when 'master_coach'   then 10
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
