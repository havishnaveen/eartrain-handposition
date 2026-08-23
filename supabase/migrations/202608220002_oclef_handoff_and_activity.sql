-- Runtime integration additions for passwordless Oclef launches, targeted
-- remediation assignments, and teacher-visible usage events.

alter table public.practice_sessions
  add column if not exists launch_id text,
  add column if not exists assignment_id text,
  add column if not exists remediation_problem text;

alter table public.exercise_attempts
  add column if not exists primary_problem text,
  add column if not exists problem_tags text[] not null default '{}',
  add column if not exists launch_id text,
  add column if not exists assignment_id text;

create index if not exists exercise_attempts_student_problem_idx
  on public.exercise_attempts (student_id, primary_problem, occurred_at desc);

create table if not exists public.learning_activity_events (
  event_id text primary key,
  schema_version integer not null,
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  session_id uuid not null references public.practice_sessions(id) on delete cascade,
  occurred_at timestamptz not null,
  activity_type text not null check (activity_type in (
    'session.started',
    'exercise.viewed',
    'exercise.started',
    'exercise.completed',
    'session.completed'
  )),
  properties jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now()
);

create index if not exists learning_activity_student_time_idx
  on public.learning_activity_events (student_id, occurred_at desc);

alter table public.learning_activity_events enable row level security;

create policy "instructors read their student learning activity"
  on public.learning_activity_events for select
  using (exists (
    select 1 from public.student_profiles s
    where s.id = student_id and s.instructor_id = auth.uid()
  ));

-- Student writes remain server-only. The exchange/ingest functions use their
-- service identity after validating a single-use grant and a scoped session
-- token; no anonymous INSERT policy is created here.
