create table if not exists public.interview_coach_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'in_progress'
    check (status in ('in_progress','completed','provider_unavailable','abandoned')),
  job_role text not null,
  industry text not null,
  company_name text not null,
  job_description text not null default '',
  candidate_context text not null default '',
  company_context text not null default '',
  source_urls text[] not null default '{}',
  external_ai_consent_at timestamptz not null,
  question_limit smallint not null default 6 check (question_limit between 3 and 10),
  questions_asked smallint not null default 0 check (questions_asked between 0 and 10),
  final_feedback jsonb,
  provider text not null default 'groq_free',
  model text not null default 'openai/gpt-oss-20b',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.interview_coach_turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.interview_coach_sessions(id) on delete cascade,
  sequence integer not null check (sequence > 0),
  speaker text not null check (speaker in ('interviewer','candidate')),
  content text not null,
  competency text,
  follow_up boolean not null default false,
  feedback text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (session_id, sequence)
);

create index if not exists interview_coach_sessions_user_updated_idx
  on public.interview_coach_sessions (user_id, updated_at desc);
create index if not exists interview_coach_turns_session_sequence_idx
  on public.interview_coach_turns (session_id, sequence);

alter table public.interview_coach_sessions enable row level security;
alter table public.interview_coach_turns enable row level security;

revoke all on public.interview_coach_sessions from anon, authenticated;
revoke all on public.interview_coach_turns from anon, authenticated;
grant select on public.interview_coach_sessions to authenticated;
grant select on public.interview_coach_turns to authenticated;

drop policy if exists interview_coach_sessions_owner_read on public.interview_coach_sessions;
create policy interview_coach_sessions_owner_read
  on public.interview_coach_sessions for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists interview_coach_turns_owner_read on public.interview_coach_turns;
create policy interview_coach_turns_owner_read
  on public.interview_coach_turns for select to authenticated
  using (exists (
    select 1 from public.interview_coach_sessions s
    where s.id = session_id and s.user_id = (select auth.uid())
  ));
