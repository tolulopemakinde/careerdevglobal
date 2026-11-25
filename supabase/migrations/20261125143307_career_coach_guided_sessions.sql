create table public.career_coach_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision uuid not null,
  next_step smallint not null default 0 check (next_step between 0 and 4),
  answers text[] not null default array['', '', '', ''],
  saved_goal_id uuid,
  updated_at timestamptz not null default now(),
  check (
    array_ndims(answers) = 1 and array_lower(answers, 1) = 1
    and cardinality(answers) = 4 and array_position(answers, null) is null
    and char_length(answers[1]) <= 2000 and char_length(answers[2]) <= 2000
    and char_length(answers[3]) <= 2000 and char_length(answers[4]) <= 2000
    and (next_step < 1 or btrim(answers[1]) <> '')
    and (next_step < 2 or btrim(answers[2]) <> '')
    and (next_step < 3 or btrim(answers[3]) <> '')
    and (next_step < 4 or btrim(answers[4]) <> '')
  )
);

alter table public.career_coach_sessions enable row level security;
revoke all on public.career_coach_sessions from public, anon, authenticated;
grant select, delete on public.career_coach_sessions to authenticated;
grant insert (user_id, revision, answers, next_step) on public.career_coach_sessions to authenticated;
grant update (revision, answers, next_step, updated_at) on public.career_coach_sessions to authenticated;

-- Ownership also lets a user retrieve or discard prior material if access expires.
create policy career_coach_session_read on public.career_coach_sessions
  for select to authenticated using (user_id = (select auth.uid()));

create policy career_coach_session_discard on public.career_coach_sessions
  for delete to authenticated using (user_id = (select auth.uid()));

create policy career_coach_session_start on public.career_coach_sessions
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and (select exists (
      select 1 from public.profiles p where p.id = (select auth.uid())
        and p.status = 'active' and p.role in ('client', 'coach', 'staff', 'admin')
    ))
    and (select exists (
      select 1 from public.ai_agent_registry a where a.agent_key = 'career_coach_agent'
        and a.owner_role = 'client_coach' and a.active
    ))
    and (select coalesce((select a.allowed from public.get_my_ai_agent_access('career_coach_agent') a), false))
  );

create policy career_coach_session_edit on public.career_coach_sessions
  for update to authenticated
  using (user_id = (select auth.uid()) and saved_goal_id is null)
  with check (
    user_id = (select auth.uid()) and saved_goal_id is null
    and (select exists (
      select 1 from public.profiles p where p.id = (select auth.uid())
        and p.status = 'active' and p.role in ('client', 'coach', 'staff', 'admin')
    ))
    and (select exists (
      select 1 from public.ai_agent_registry a where a.agent_key = 'career_coach_agent'
        and a.owner_role = 'client_coach' and a.active
    ))
    and (select coalesce((select a.allowed from public.get_my_ai_agent_access('career_coach_agent') a), false))
  );

create function public.save_my_career_coach_action(p_revision uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  session_row public.career_coach_sessions%rowtype;
  own_client uuid;
  result_id uuid;
begin
  if caller is null or not exists (
    select 1 from public.profiles p where p.id = caller and p.status = 'active'
      and p.role in ('client', 'coach', 'staff', 'admin')
  ) or not exists (
    select 1 from public.ai_agent_registry a where a.agent_key = 'career_coach_agent'
      and a.owner_role = 'client_coach' and a.active
  ) or not exists (
    select 1 from public.get_my_ai_agent_access('career_coach_agent') a where a.allowed
  ) then
    raise exception 'Career Coach access is required' using errcode = '42501';
  end if;

  select * into session_row from public.career_coach_sessions s
  where s.user_id = caller for update;
  if not found or session_row.revision is distinct from p_revision or session_row.next_step <> 4 then
    raise exception 'Reload your completed Career Coach plan before saving' using errcode = '40001';
  end if;
  if session_row.saved_goal_id is not null then
    return session_row.saved_goal_id;
  end if;

  select c.id into own_client from public.clients c where c.profile_id = caller and c.status = 'active';
  if not found then
    raise exception 'A client profile is required to save to Career Goals' using errcode = '42501';
  end if;

  insert into public.career_goals (client_id, goal, priority, target_date, status)
  values (own_client, 'Career Coach action: ' || session_row.answers[3]
    || ' | Progress evidence: ' || session_row.answers[4], 1, current_date + 7, 'active')
  returning id into result_id;

  update public.career_coach_sessions set saved_goal_id = result_id, updated_at = now()
  where user_id = caller;
  return result_id;
end;
$$;

revoke all on function public.save_my_career_coach_action(uuid) from public, anon, authenticated;
grant execute on function public.save_my_career_coach_action(uuid) to authenticated;
