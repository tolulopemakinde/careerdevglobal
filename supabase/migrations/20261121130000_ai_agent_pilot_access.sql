-- Controlled, no-charge access for the Career Intelligence pilot.
-- Pilot access is intentionally disabled until the owner sets a bounded end date.
create table if not exists public.ai_agent_pilot_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  ends_at timestamptz,
  participant_ids uuid[] not null default '{}'::uuid[],
  agent_keys text[] not null default array[
    'career_assessment_agent',
    'skills_gaps_agent',
    'learning_development_agent',
    'career_discovery_agent',
    'ethics_quality_assurance_agent',
    'talent_mobility_agent',
    'career_coach_agent',
    'job_search_intelligence_agent',
    'academic_career_transition_agent',
    'employer_talent_agent',
    'career_research_agent'
  ]::text[],
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.ai_agent_pilot_settings(singleton, enabled, ends_at)
values (true, false, null)
on conflict (singleton) do nothing;

alter table public.ai_agent_pilot_settings enable row level security;
revoke all on public.ai_agent_pilot_settings from public, anon, authenticated;

-- Keep an existing refund/payment entitlement gate when one is installed. The
-- production project does not currently have this billing helper, while the
-- restored acceptance project does. Dynamic lookup keeps this migration
-- compatible with both schema baselines without weakening the latter.
create or replace function public.ai_agent_subscription_payment_access_allowed(p_subscription_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  payment_allowed boolean;
begin
  if pg_catalog.to_regprocedure('public.ai_payment_access_allowed(uuid)') is null then
    return true;
  end if;
  execute 'select public.ai_payment_access_allowed($1)' into payment_allowed using p_subscription_id;
  return coalesce(payment_allowed, false);
end;
$function$;

revoke all on function public.ai_agent_subscription_payment_access_allowed(uuid) from public, anon, authenticated, service_role;

create or replace function public.get_my_ai_agent_access(p_agent_key text)
returns table(allowed boolean, plan_key text, plan_name text, status text)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  u uuid := auth.uid();
  role_name text;
  pilot public.ai_agent_pilot_settings%rowtype;
begin
  select p.role into role_name
  from public.profiles p
  where p.id = u and p.status = 'active';

  if role_name in ('staff', 'admin') then
    return query select true, null::text, 'Staff/Admin Full Access'::text, 'privileged'::text;
    return;
  end if;

  select s.* into pilot
  from public.ai_agent_pilot_settings s
  where s.singleton = true;

  if role_name in ('client', 'coach')
     and coalesce(pilot.enabled, false)
     and pilot.ends_at > now()
     and u = any(coalesce(pilot.participant_ids, '{}'::uuid[]))
     and p_agent_key = any(coalesce(pilot.agent_keys, '{}'::text[]))
     and exists (
       select 1 from public.ai_agent_registry a
       where a.agent_key = p_agent_key
         and a.active = true
         and a.ai_dependency_mode in ('works_without_ai', 'ai_optional')
     ) then
    return query select true, 'pilot_no_charge'::text, 'Career Intelligence Pilot'::text, 'pilot'::text;
    return;
  end if;

  return query
  select exists (
    select 1
    from public.ai_agent_subscriptions s
    join public.ai_agent_subscription_plans p on p.plan_key = s.plan_key
    where s.user_id = u
      and s.status in ('active', 'non_renewing', 'attention')
      and s.current_period_start <= now()
      and (s.current_period_end is null or s.current_period_end > now())
      and public.ai_agent_subscription_payment_access_allowed(s.id)
      and p_agent_key = any(p.included_agents)
      and p.active = true
  ),
  (
    select s.plan_key
    from public.ai_agent_subscriptions s
    join public.ai_agent_subscription_plans p on p.plan_key = s.plan_key
    where s.user_id = u
      and s.status in ('active', 'non_renewing', 'attention')
      and s.current_period_start <= now()
      and (s.current_period_end is null or s.current_period_end > now())
      and public.ai_agent_subscription_payment_access_allowed(s.id)
    order by s.created_at desc limit 1
  ),
  (
    select p.name
    from public.ai_agent_subscriptions s
    join public.ai_agent_subscription_plans p on p.plan_key = s.plan_key
    where s.user_id = u
      and s.status in ('active', 'non_renewing', 'attention')
      and s.current_period_start <= now()
      and (s.current_period_end is null or s.current_period_end > now())
      and public.ai_agent_subscription_payment_access_allowed(s.id)
      and p.active = true
    order by s.created_at desc limit 1
  ),
  (
    select s.status
    from public.ai_agent_subscriptions s
    where s.user_id = u
      and s.status in ('active', 'non_renewing', 'attention')
      and s.current_period_start <= now()
      and (s.current_period_end is null or s.current_period_end > now())
      and public.ai_agent_subscription_payment_access_allowed(s.id)
    order by s.created_at desc limit 1
  );
end;
$function$;

revoke all on function public.get_my_ai_agent_access(text) from public, anon;
grant execute on function public.get_my_ai_agent_access(text) to authenticated, service_role;

create or replace function public.request_ai_agent_execution(
  p_agent_key text,
  p_workflow_key text default null,
  p_trigger_source text default 'manual',
  p_input_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  u uuid := auth.uid();
  role_name text;
  a public.ai_agent_registry%rowtype;
  w public.ai_agent_workflows%rowtype;
  req uuid;
  access_allowed boolean := false;
begin
  select p.role into role_name
  from public.profiles p
  where p.id = u and p.status = 'active';
  if role_name is null or role_name not in ('admin', 'staff', 'coach', 'client') then
    raise exception 'Authorized CareerDev Global access required';
  end if;

  select * into a
  from public.ai_agent_registry
  where agent_key = p_agent_key and active = true;
  if not found then raise exception 'Active AI agent not found'; end if;
  if a.owner_role in ('staff', 'admin') and role_name not in ('staff', 'admin') then
    raise exception 'This staff/admin agent is restricted to Staff/Admin access';
  end if;
  if a.owner_role = 'client_coach' and role_name in ('coach', 'client') then
    select coalesce(agent_access.allowed, false) into access_allowed
    from public.get_my_ai_agent_access(a.agent_key) agent_access;
    if not access_allowed then
      raise exception 'An active CareerDev AI Agent subscription or pilot access is required for this agent';
    end if;
  end if;

  if p_workflow_key is not null then
    select * into w
    from public.ai_agent_workflows
    where agent_id = a.id and workflow_key = p_workflow_key and active = true
    order by version desc limit 1;
    if not found then raise exception 'Active workflow not found for agent'; end if;
  end if;

  insert into public.ai_agent_execution_requests(
    agent_id, workflow_id, requested_by, trigger_source, input_payload, status, authorized_at
  )
  values (
    a.id, case when w.id is null then null else w.id end, u, p_trigger_source,
    coalesce(p_input_payload, '{}'::jsonb), 'authorized', now()
  )
  returning id into req;

  insert into public.ai_agent_execution_events(request_id, event_type, event_data, actor_id)
  values
    (req, 'requested', jsonb_build_object('agent_key', a.agent_key, 'workflow_key', p_workflow_key), u),
    (req, 'authorized', jsonb_build_object('autonomy_level', a.autonomy_level, 'human_approval_required', a.human_approval_required), u);
  return req;
end;
$function$;

create or replace function public.configure_ai_agent_pilot(
  p_enabled boolean,
  p_ends_at timestamptz default null,
  p_participant_ids uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  role_name text;
begin
  select p.role into role_name
  from public.profiles p
  where p.id = auth.uid() and p.status = 'active';
  if role_name is distinct from 'admin' then
    raise exception 'Active admin access required';
  end if;
  if p_enabled is null then
    raise exception 'Pilot enabled state is required';
  end if;
  if p_enabled and (p_ends_at is null or p_ends_at <= now() or p_ends_at > now() + interval '3 months') then
    raise exception 'Pilot expiry must be in the future and no more than three months away';
  end if;
  if p_enabled and (p_participant_ids is null or cardinality(p_participant_ids) = 0 or cardinality(p_participant_ids) > 200) then
    raise exception 'Pilot access requires between 1 and 200 explicitly enrolled participants';
  end if;
  update public.ai_agent_pilot_settings
  set enabled = p_enabled,
      ends_at = case when p_enabled then p_ends_at else null end,
      participant_ids = case when p_enabled then p_participant_ids else '{}'::uuid[] end,
      updated_at = now(),
      updated_by = auth.uid()
  where singleton = true;
end;
$function$;

revoke all on function public.configure_ai_agent_pilot(boolean, timestamptz, uuid[]) from public, anon;
grant execute on function public.configure_ai_agent_pilot(boolean, timestamptz, uuid[]) to authenticated;
