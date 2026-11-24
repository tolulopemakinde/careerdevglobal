-- Operational execution for the seven Staff/Admin agents is opt-in by registry
-- state and trigger source. These database guards remain effective if a caller
-- bypasses the Admin page and invokes the existing RPCs directly.

create or replace function public.guard_staff_admin_agent_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  agent_row record;
  workflow_row record;
  actor_role text;
  actor_status text;
  expected_workflow text;
  quality_score numeric;
  completed_count numeric;
  target_count numeric;
begin
  select ar.id, ar.agent_key, ar.owner_role, ar.status, ar.active,
         ar.human_approval_required
    into agent_row
    from public.ai_agent_registry ar
   where ar.id = new.agent_id;

  if not found then return new; end if;
  if agent_row.agent_key not in (
    'ceo_operations_ai', 'career_discovery_ai', 'cv_linkedin_ai',
    'lead_generation_ai', 'marketing_content_ai',
    'research_opportunities_ai', 'sales_proposal_ai'
  ) then
    return new;
  end if;
  if agent_row.agent_key <> 'ceo_operations_ai' then
    raise exception 'Only CEO Operations AI is in the current staged operational rollout';
  end if;

  select p.role, p.status into actor_role, actor_status
    from public.profiles p where p.id = auth.uid();
  if auth.uid() is null or new.requested_by <> auth.uid()
     or actor_status is distinct from 'active' or actor_role is null
     or actor_role not in ('admin', 'staff') then
    raise exception 'Active Staff/Admin access is required for this agent';
  end if;

  if (agent_row.owner_role is distinct from 'admin' and agent_row.owner_role is distinct from 'staff')
     or (agent_row.owner_role = 'admin' and actor_role <> 'admin')
     or (agent_row.owner_role = 'staff' and actor_role not in ('admin', 'staff')) then
    raise exception 'Caller is not authorized for this Staff/Admin agent owner role';
  end if;
  if (agent_row.agent_key = 'ceo_operations_ai' and agent_row.owner_role is distinct from 'admin')
     or (agent_row.agent_key <> 'ceo_operations_ai' and agent_row.owner_role is distinct from 'staff') then
    raise exception 'Staff/Admin agent owner role does not match the approved agent contract';
  end if;
  if agent_row.status <> 'active' or agent_row.active is not true then
    raise exception 'Staff/Admin agent is not operationally active';
  end if;
  if agent_row.human_approval_required is not true then
    raise exception 'Staff/Admin agents must retain human approval';
  end if;

  expected_workflow := case agent_row.agent_key
    when 'ceo_operations_ai' then 'executive_performance_review'
    when 'career_discovery_ai' then 'career_profile_analysis'
    when 'cv_linkedin_ai' then 'cv_service_delivery'
    when 'lead_generation_ai' then 'lead_qualification'
    when 'marketing_content_ai' then 'content_creation'
    when 'research_opportunities_ai' then 'opportunity_research'
    when 'sales_proposal_ai' then 'proposal_generation'
  end;
  select aw.workflow_key, aw.active into workflow_row
    from public.ai_agent_workflows aw
   where aw.id = new.workflow_id and aw.agent_id = agent_row.id;
  if not found then
    raise exception 'Staff/Admin workflow contract is not active or does not match the agent';
  end if;
  if workflow_row.workflow_key <> expected_workflow or workflow_row.active is not true then
    raise exception 'Staff/Admin workflow contract is not active or does not match the agent';
  end if;
  if new.trigger_source <> 'staff_admin_operational' then
    raise exception 'Staff/Admin agents require the explicit operational trigger';
  end if;
  if jsonb_typeof(new.input_payload) <> 'object'
     or new.input_payload ? 'output_schema'
     or new.input_payload ? 'service_execution_id' then
    raise exception 'Staff/Admin input must be an object and cannot override execution routing or output schema';
  end if;

  if agent_row.agent_key = 'ceo_operations_ai' then
    if jsonb_typeof(new.input_payload#>'{quality,delivery_score}') = 'number' then
      quality_score := (new.input_payload#>>'{quality,delivery_score}')::numeric;
    end if;
    if jsonb_typeof(new.input_payload#>'{outcomes,completed}') = 'number'
       and (new.input_payload#>>'{outcomes,completed}') ~ '^(0|[1-9][0-9]*)$' then
      completed_count := (new.input_payload#>>'{outcomes,completed}')::numeric;
    end if;
    if jsonb_typeof(new.input_payload#>'{outcomes,target}') = 'number'
       and (new.input_payload#>>'{outcomes,target}') ~ '^[1-9][0-9]*$' then
      target_count := (new.input_payload#>>'{outcomes,target}')::numeric;
    end if;
    if (case when jsonb_typeof(new.input_payload) = 'object' then jsonb_object_length(new.input_payload) else -1 end) <> 3
       or not (new.input_payload ?& array['quality', 'outcomes', 'performance_data'])
       or jsonb_typeof(new.input_payload->'quality') <> 'object'
       or (case when jsonb_typeof(new.input_payload->'quality') = 'object' then jsonb_object_length(new.input_payload->'quality') else -1 end) <> 1
       or quality_score is null
       or quality_score < 0
       or quality_score > 1
       or jsonb_typeof(new.input_payload->'outcomes') <> 'object'
       or (case when jsonb_typeof(new.input_payload->'outcomes') = 'object' then jsonb_object_length(new.input_payload->'outcomes') else -1 end) <> 2
       or completed_count is null
       or target_count is null
       or completed_count > target_count
       or jsonb_typeof(new.input_payload->'performance_data') <> 'object'
       or (case when jsonb_typeof(new.input_payload->'performance_data') = 'object' then jsonb_object_length(new.input_payload->'performance_data') else -1 end) <> 1
       or coalesce(new.input_payload#>>'{performance_data,reporting_period}', '') !~ '^(FY)?20[0-9]{2}([-/ ]?(Q[1-4]|H[1-2]|M(0[1-9]|1[0-2])))?$' then
      raise exception 'CEO Operations accepts only validated aggregate period, delivery score, completed count and target';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists guard_staff_admin_agent_request_insert on public.ai_agent_execution_requests;
create trigger guard_staff_admin_agent_request_insert
before insert on public.ai_agent_execution_requests
for each row execute function public.guard_staff_admin_agent_request();

create or replace function public.guard_staff_admin_agent_execution_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  agent_key text;
  agent_row record;
  workflow_row record;
  request_row record;
  approval_exists boolean;
  actor_role text;
  actor_status text;
  expected_workflow text;
begin
  select ar.agent_key, ar.owner_role, ar.status, ar.active, ar.human_approval_required
    into agent_row
    from public.ai_agent_registry ar where ar.id = new.agent_id;
  if not found then return new; end if;
  agent_key := agent_row.agent_key;
  if agent_key not in (
    'ceo_operations_ai', 'career_discovery_ai', 'cv_linkedin_ai',
    'lead_generation_ai', 'marketing_content_ai',
    'research_opportunities_ai', 'sales_proposal_ai'
  ) then
    return new;
  end if;

  if new.human_review_required is not true then
    raise exception 'Staff/Admin agent executions must retain the human-review requirement';
  end if;

  if tg_op = 'INSERT' then
    if agent_key <> 'ceo_operations_ai' then
      raise exception 'Only CEO Operations AI is in the current staged operational rollout';
    end if;
    select p.role, p.status into actor_role, actor_status
      from public.profiles p where p.id = auth.uid();
    if auth.uid() is null or actor_status is distinct from 'active'
       or actor_role is null or actor_role not in ('admin', 'staff') then
      raise exception 'Active Staff/Admin access is required to prepare this agent execution';
    end if;
    if (agent_key = 'ceo_operations_ai' and (agent_row.owner_role is distinct from 'admin' or actor_role <> 'admin'))
       or (agent_key <> 'ceo_operations_ai' and (agent_row.owner_role is distinct from 'staff' or actor_role not in ('admin', 'staff'))) then
      raise exception 'Caller is not authorized for this Staff/Admin agent owner role';
    end if;
    if agent_row.status <> 'active' or agent_row.active is not true
       or agent_row.human_approval_required is not true then
      raise exception 'Staff/Admin agent is not operationally ready';
    end if;
    expected_workflow := case agent_key
      when 'ceo_operations_ai' then 'executive_performance_review'
      when 'career_discovery_ai' then 'career_profile_analysis'
      when 'cv_linkedin_ai' then 'cv_service_delivery'
      when 'lead_generation_ai' then 'lead_qualification'
      when 'marketing_content_ai' then 'content_creation'
      when 'research_opportunities_ai' then 'opportunity_research'
      when 'sales_proposal_ai' then 'proposal_generation'
    end;
    select aw.workflow_key, aw.active into workflow_row
      from public.ai_agent_workflows aw
     where aw.id = new.workflow_id and aw.agent_id = new.agent_id;
    if not found then
      raise exception 'Staff/Admin operational workflow contract is not valid';
    end if;
    if workflow_row.workflow_key <> expected_workflow or workflow_row.active is not true
       or new.trigger_source is distinct from 'staff_admin_operational' then
      raise exception 'Staff/Admin operational workflow contract is not valid';
    end if;
  end if;

  if new.status = 'completed' then
    if new.human_review_status <> 'approved' then
      raise exception 'Staff/Admin agent execution cannot complete before human approval';
    end if;
    select r.id, r.requested_by into request_row
      from public.ai_agent_execution_requests r
     where r.execution_id = new.id;
    if not found then
      raise exception 'Staff/Admin agent request is required before execution completion';
    end if;
    select exists (
      select 1 from public.ai_human_approval_requests a
       where a.request_id = request_row.id
         and a.execution_id = new.id
         and a.status = 'approved'
         and a.approved_by is not null
         and a.approved_by <> request_row.requested_by
    ) into approval_exists;
    if not approval_exists then
      raise exception 'Independent human approval record is required before completion';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists guard_staff_admin_agent_execution_review on public.ai_agent_executions;
create trigger guard_staff_admin_agent_execution_review
before insert or update of status, human_review_required, human_review_status
on public.ai_agent_executions
for each row execute function public.guard_staff_admin_agent_execution_review();

revoke all on function public.guard_staff_admin_agent_request() from public, anon;
revoke all on function public.guard_staff_admin_agent_execution_review() from public, anon;
