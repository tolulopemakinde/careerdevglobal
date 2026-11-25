create table public.ceo_operations_release_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  action text not null check (action in ('activate','deactivate')),
  prior_status text not null,
  prior_active boolean not null,
  status text not null,
  active boolean not null,
  verification_reference text,
  created_at timestamptz not null default now(),
  check ((action = 'activate' and status = 'live' and active and verification_reference is not null)
      or (action = 'deactivate' and status = 'testing' and not active and verification_reference is null))
);

create index ceo_operations_release_events_recent_idx
  on public.ceo_operations_release_events (created_at desc);

alter table public.ceo_operations_release_events enable row level security;
revoke all on public.ceo_operations_release_events from public, anon, authenticated;
grant select on public.ceo_operations_release_events to authenticated;
create policy ceo_operations_release_events_admin_read
  on public.ceo_operations_release_events for select to authenticated
  using (exists (
    select 1 from public.profiles p where p.id = (select auth.uid())
      and p.role = 'admin' and p.status = 'active'
  ));

-- Only the authenticated Edge handler can call this transaction. Its provider-readiness
-- verdict is server-supplied. Recheck the actor and the registry contract here.
create function public.set_ceo_operations_release(
  p_actor_id uuid,
  p_action text,
  p_expected_status text,
  p_expected_active boolean,
  p_readiness_passed boolean,
  p_verification_confirmed boolean,
  p_verification_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  agent public.ai_agent_registry%rowtype;
  next_status text;
  next_active boolean;
  reference text;
  release_id uuid;
begin
  if not exists (
    select 1 from public.profiles p where p.id = p_actor_id
      and p.status = 'active' and p.role = 'admin'
  ) then
    raise exception 'Active Administrator required' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('activate','deactivate') or
      p_expected_status is null or p_expected_active is null then
    raise exception 'A valid release action and expected registry state are required' using errcode = '22023';
  end if;

  select * into agent from public.ai_agent_registry a
    where a.agent_key = 'ceo_operations_ai' for update;
  if not found then
    raise exception 'CEO Operations registry entry is unavailable' using errcode = 'P0001';
  end if;

  if p_action = 'activate' then
    reference := nullif(btrim(p_verification_reference), '');
    if p_readiness_passed is not true or p_verification_confirmed is not true or
       reference is null or char_length(reference) not between 3 and 200 then
      raise exception 'Record completed workflow checks and provider-side spend-limit verification' using errcode = '22023';
    end if;
    if agent.owner_role is distinct from 'admin' or agent.human_approval_required is not true or not exists (
      select 1 from public.ai_agent_workflows w where w.agent_id = agent.id
        and w.workflow_key = 'executive_performance_review' and w.active
    ) then
      raise exception 'The Admin owner, active executive workflow, and independent review gate are required' using errcode = 'P0001';
    end if;
    next_status := 'live';
    next_active := true;
  else
    next_status := 'testing';
    next_active := false;
  end if;

  if agent.status::text = next_status and agent.active = next_active then
    return jsonb_build_object('status',agent.status,'active',agent.active,
      'human_approval_required',agent.human_approval_required,'changed',false);
  end if;
  if agent.status::text is distinct from p_expected_status or agent.active is distinct from p_expected_active then
    raise exception 'Registry state has changed. Refresh and try again' using errcode = '40001';
  end if;
  if p_action = 'activate' and (agent.status <> 'testing' or agent.active) then
    raise exception 'Only the inactive testing state can be activated' using errcode = 'P0001';
  end if;

  -- Literal states preserve compatibility with registry status types.
  if next_active then
    update public.ai_agent_registry set status = 'live', active = true, updated_at = now() where id = agent.id;
  else
    update public.ai_agent_registry set status = 'testing', active = false, updated_at = now() where id = agent.id;
  end if;

  insert into public.ceo_operations_release_events
    (actor_id, action, prior_status, prior_active, status, active, verification_reference)
    values (p_actor_id, p_action, agent.status::text, agent.active, next_status, next_active, reference)
    returning id into release_id;
  return jsonb_build_object('status',next_status,'active',next_active,
    'human_approval_required',agent.human_approval_required,'changed',true,'event_id',release_id);
end;
$$;

revoke all on function public.set_ceo_operations_release(uuid,text,text,boolean,boolean,boolean,text)
  from public, anon, authenticated;
grant execute on function public.set_ceo_operations_release(uuid,text,text,boolean,boolean,boolean,text)
  to service_role;
