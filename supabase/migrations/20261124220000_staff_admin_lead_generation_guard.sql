-- Extends the staged Staff/Admin rollout to Lead Generation AI, with a synthetic-only
-- organization need/service-fit contract and explicit no-outreach consent boundaries.

-- Extends the staged Staff/Admin rollout to Lead Generation AI. The exact synthetic
-- evidence contract and independent human-approval guards remain enforced in SQL.

-- Extends the staged release to Career Discovery AI and CV & LinkedIn AI while preserving
-- its synthetic-input contract, independent approval, and testing registry state.

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
  input_key_count integer;
  quality_key_count integer;
  outcomes_key_count integer;
  performance_key_count integer;
  career_profile_key_count integer;
  service_request_key_count integer;
  skills_valid boolean;
  target_roles_valid boolean;
  cv_input_key_count integer;
  cv_blueprint_key_count integer;
  cv_document_count integer;
  cv_document_key_count integer;
  cv_profile_key_count integer;
  cv_request_key_count integer;
  cv_experience_count integer;
  cv_skills_count integer;
  cv_experience_valid boolean;
  cv_skills_valid boolean;
  lead_input_key_count integer;
  lead_key_count integer;
  lead_needs_count integer;
  service_count integer;
  lead_needs_valid boolean;
  service_catalog_valid boolean;
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
  if agent_row.agent_key not in ('ceo_operations_ai', 'career_discovery_ai', 'cv_linkedin_ai', 'lead_generation_ai') then
    raise exception 'Only CEO Operations AI, Career Discovery AI, CV & LinkedIn AI, and Lead Generation AI are in the current staged operational rollout';
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
  if agent_row.status <> 'live' or agent_row.active is not true then
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
  if jsonb_typeof(new.input_payload) is distinct from 'object'
     or new.input_payload ? 'output_schema'
     or new.input_payload ? 'service_execution_id' then
    raise exception 'Staff/Admin input must be an object and cannot override execution routing or output schema';
  end if;

  if agent_row.agent_key = 'ceo_operations_ai' then
    select count(*) into input_key_count from jsonb_object_keys(new.input_payload);
    if jsonb_typeof(new.input_payload->'quality') = 'object' then
      select count(*) into quality_key_count from jsonb_object_keys(new.input_payload->'quality');
    else quality_key_count := -1;
    end if;
    if jsonb_typeof(new.input_payload->'outcomes') = 'object' then
      select count(*) into outcomes_key_count from jsonb_object_keys(new.input_payload->'outcomes');
    else outcomes_key_count := -1;
    end if;
    if jsonb_typeof(new.input_payload->'performance_data') = 'object' then
      select count(*) into performance_key_count from jsonb_object_keys(new.input_payload->'performance_data');
    else performance_key_count := -1;
    end if;
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
    if input_key_count <> 3
       or not (new.input_payload ?& array['quality', 'outcomes', 'performance_data'])
       or jsonb_typeof(new.input_payload->'quality') <> 'object'
       or quality_key_count <> 1
       or quality_score is null
       or quality_score < 0
       or quality_score > 1
       or jsonb_typeof(new.input_payload->'outcomes') <> 'object'
       or outcomes_key_count <> 2
       or completed_count is null
       or target_count is null
       or completed_count > target_count
       or jsonb_typeof(new.input_payload->'performance_data') <> 'object'
       or performance_key_count <> 1
       or coalesce(new.input_payload#>>'{performance_data,reporting_period}', '') !~ '^(FY)?20[0-9]{2}([-/ ]?(Q[1-4]|H[1-2]|M(0[1-9]|1[0-2])))?$' then
      raise exception 'CEO Operations accepts only validated aggregate period, delivery score, completed count and target';
    end if;
  end if;

  if agent_row.agent_key = 'career_discovery_ai' then
    select count(*) into input_key_count from jsonb_object_keys(new.input_payload);
    if jsonb_typeof(new.input_payload->'career_profile') = 'object' then
      select count(*) into career_profile_key_count from jsonb_object_keys(new.input_payload->'career_profile');
    else career_profile_key_count := -1;
    end if;
    if jsonb_typeof(new.input_payload->'service_request') = 'object' then
      select count(*) into service_request_key_count from jsonb_object_keys(new.input_payload->'service_request');
    else service_request_key_count := -1;
    end if;
    if jsonb_typeof(new.input_payload#>'{career_profile,skills}') = 'array' then
      select coalesce(bool_and(jsonb_typeof(value) = 'string' and length(btrim(value #>> '{}')) between 1 and 1200), false)
        into skills_valid from jsonb_array_elements(new.input_payload#>'{career_profile,skills}');
    else skills_valid := false;
    end if;
    if jsonb_typeof(new.input_payload#>'{service_request,target_roles}') = 'array' then
      select coalesce(bool_and(jsonb_typeof(value) = 'string' and length(btrim(value #>> '{}')) between 1 and 1200), true)
        into target_roles_valid from jsonb_array_elements(new.input_payload#>'{service_request,target_roles}');
    else target_roles_valid := false;
    end if;
    if input_key_count <> 2
       or not (new.input_payload ?& array['career_profile', 'service_request'])
       or jsonb_typeof(new.input_payload->'career_profile') <> 'object'
       or career_profile_key_count <> 4
       or not (new.input_payload->'career_profile' ?& array['source', 'education', 'experience', 'skills'])
       or new.input_payload#>>'{career_profile,source}' is distinct from 'synthetic'
       or length(btrim(coalesce(new.input_payload#>>'{career_profile,education}', ''))) not between 1 and 1200
       or length(btrim(coalesce(new.input_payload#>>'{career_profile,experience}', ''))) not between 1 and 1200
       or jsonb_typeof(new.input_payload#>'{career_profile,skills}') <> 'array'
       or jsonb_array_length(new.input_payload#>'{career_profile,skills}') not between 1 and 20
       or skills_valid is not true
       or jsonb_typeof(new.input_payload->'service_request') <> 'object'
       or service_request_key_count <> 3
       or not (new.input_payload->'service_request' ?& array['source', 'goal', 'target_roles'])
       or new.input_payload#>>'{service_request,source}' is distinct from 'synthetic'
       or length(btrim(coalesce(new.input_payload#>>'{service_request,goal}', ''))) not between 1 and 1200
       or jsonb_typeof(new.input_payload#>'{service_request,target_roles}') <> 'array'
       or jsonb_array_length(new.input_payload#>'{service_request,target_roles}') > 10
       or target_roles_valid is not true
       or new.input_payload::text ~* '(https?://|linkedin[.]com/|[[:alnum:]._%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}|[+]?[0-9][0-9 ()-]{7,}[0-9])' then
      raise exception 'Career Discovery accepts only bounded synthetic inputs without contact details or profile URLs';
    end if;
  end if;
  if agent_row.agent_key = 'cv_linkedin_ai' then
    select count(*) into cv_input_key_count from jsonb_object_keys(new.input_payload);
    if jsonb_typeof(new.input_payload->'blueprint') = 'object' then
      select count(*) into cv_blueprint_key_count from jsonb_object_keys(new.input_payload->'blueprint');
    else cv_blueprint_key_count := -1;
    end if;
    if jsonb_typeof(new.input_payload->'documents') = 'array' then
      cv_document_count := jsonb_array_length(new.input_payload->'documents');
    else cv_document_count := -1;
    end if;
    if cv_document_count = 1 and jsonb_typeof(new.input_payload#>'{documents,0}') = 'object' then
      select count(*) into cv_document_key_count from jsonb_object_keys(new.input_payload#>'{documents,0}');
    else cv_document_key_count := -1;
    end if;
    if jsonb_typeof(new.input_payload->'career_profile') = 'object' then
      select count(*) into cv_profile_key_count from jsonb_object_keys(new.input_payload->'career_profile');
    else cv_profile_key_count := -1;
    end if;
    if jsonb_typeof(new.input_payload->'service_request') = 'object' then
      select count(*) into cv_request_key_count from jsonb_object_keys(new.input_payload->'service_request');
    else cv_request_key_count := -1;
    end if;
    if jsonb_typeof(new.input_payload#>'{career_profile,experience}') = 'array' then
      cv_experience_count := jsonb_array_length(new.input_payload#>'{career_profile,experience}');
      select coalesce(bool_and(jsonb_typeof(value) = 'string' and length(btrim(value #>> '{}')) between 1 and 1000), false)
        into cv_experience_valid from jsonb_array_elements(new.input_payload#>'{career_profile,experience}');
    else cv_experience_count := -1; cv_experience_valid := false;
    end if;
    if jsonb_typeof(new.input_payload#>'{career_profile,skills}') = 'array' then
      cv_skills_count := jsonb_array_length(new.input_payload#>'{career_profile,skills}');
      select coalesce(bool_and(jsonb_typeof(value) = 'string' and length(btrim(value #>> '{}')) between 1 and 1000), false)
        into cv_skills_valid from jsonb_array_elements(new.input_payload#>'{career_profile,skills}');
    else cv_skills_count := -1; cv_skills_valid := false;
    end if;
    if cv_input_key_count <> 4
       or not (new.input_payload ?& array['blueprint', 'documents', 'career_profile', 'service_request'])
       or jsonb_typeof(new.input_payload->'blueprint') <> 'object'
       or cv_blueprint_key_count <> 2
       or not (new.input_payload->'blueprint' ?& array['source', 'target_role'])
       or new.input_payload#>>'{blueprint,source}' is distinct from 'synthetic'
       or length(btrim(coalesce(new.input_payload#>>'{blueprint,target_role}', ''))) not between 1 and 1500
       or cv_document_count <> 1
       or cv_document_key_count <> 3
       or not (new.input_payload#>'{documents,0}' ?& array['source', 'document_type', 'content'])
       or new.input_payload#>>'{documents,0,source}' is distinct from 'synthetic'
       or new.input_payload#>>'{documents,0,document_type}' <> 'career_evidence'
       or length(btrim(coalesce(new.input_payload#>>'{documents,0,content}', ''))) not between 1 and 6000
       or jsonb_typeof(new.input_payload->'career_profile') <> 'object'
       or cv_profile_key_count <> 4
       or not (new.input_payload->'career_profile' ?& array['source', 'summary', 'experience', 'skills'])
       or new.input_payload#>>'{career_profile,source}' is distinct from 'synthetic'
       or length(btrim(coalesce(new.input_payload#>>'{career_profile,summary}', ''))) not between 1 and 1500
       or cv_experience_count not between 1 and 10
       or cv_experience_valid is not true
       or cv_skills_count not between 1 and 20
       or cv_skills_valid is not true
       or jsonb_typeof(new.input_payload->'service_request') <> 'object'
       or cv_request_key_count <> 3
       or not (new.input_payload->'service_request' ?& array['source', 'deliverables', 'target_role'])
       or new.input_payload#>>'{service_request,source}' is distinct from 'synthetic'
       or jsonb_typeof(new.input_payload#>'{service_request,deliverables}') <> 'array'
       or jsonb_array_length(new.input_payload#>'{service_request,deliverables}') <> 2
       or not (new.input_payload#>'{service_request,deliverables}' @> '["cv", "linkedin"]'::jsonb)
       or new.input_payload#>>'{service_request,target_role}' <> new.input_payload#>>'{blueprint,target_role}'
       or length(btrim(coalesce(new.input_payload#>>'{service_request,target_role}', ''))) not between 1 and 1500
       or new.input_payload::text ~* '(https?://|linkedin[.]com/|[[:alnum:]._%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}|[+]?[0-9][0-9 ()-]{7,}[0-9])' then
      raise exception 'CV & LinkedIn accepts only bounded synthetic career evidence without contact details or profile URLs';
    end if;
  end if;
  if agent_row.agent_key = 'lead_generation_ai' then
    select count(*) into lead_input_key_count from jsonb_object_keys(new.input_payload);
    if jsonb_typeof(new.input_payload->'lead') = 'object' then
      select count(*) into lead_key_count from jsonb_object_keys(new.input_payload->'lead');
    else lead_key_count := -1;
    end if;
    if jsonb_typeof(new.input_payload#>'{lead,needs}') = 'array' then
      lead_needs_count := jsonb_array_length(new.input_payload#>'{lead,needs}');
      select coalesce(bool_and(jsonb_typeof(value) = 'string' and length(btrim(value #>> '{}')) between 1 and 1200), false)
        into lead_needs_valid from jsonb_array_elements(new.input_payload#>'{lead,needs}');
    else lead_needs_count := -1; lead_needs_valid := false;
    end if;
    if jsonb_typeof(new.input_payload->'service_catalog') = 'array' then
      service_count := jsonb_array_length(new.input_payload->'service_catalog');
      select coalesce(bool_and(
        jsonb_typeof(value) = 'object'
        and (select count(*) from jsonb_object_keys(value)) = 3
        and value ?& array['source', 'service_name', 'description']
        and value->>'source' = 'synthetic'
        and length(btrim(coalesce(value->>'service_name', ''))) between 1 and 1200
        and length(btrim(coalesce(value->>'description', ''))) between 1 and 1200
      ), false) into service_catalog_valid
      from jsonb_array_elements(new.input_payload->'service_catalog');
    else service_count := -1; service_catalog_valid := false;
    end if;
    if lead_input_key_count <> 2
       or not (new.input_payload ?& array['lead', 'service_catalog'])
       or jsonb_typeof(new.input_payload->'lead') <> 'object'
       or lead_key_count <> 5
       or not (new.input_payload->'lead' ?& array['source', 'role_title', 'organization_type', 'needs', 'consent_status'])
       or new.input_payload#>>'{lead,source}' is distinct from 'synthetic'
       or length(btrim(coalesce(new.input_payload#>>'{lead,role_title}', ''))) not between 1 and 1200
       or length(btrim(coalesce(new.input_payload#>>'{lead,organization_type}', ''))) not between 1 and 1200
       or lead_needs_count not between 1 and 10
       or lead_needs_valid is not true
       or coalesce(new.input_payload#>>'{lead,consent_status}', '') not in ('unknown', 'consent_confirmed', 'do_not_contact')
       or jsonb_typeof(new.input_payload->'service_catalog') <> 'array'
       or service_count not between 1 and 10
       or service_catalog_valid is not true
       or new.input_payload::text ~* '(https?://|linkedin[.]com/|[[:alnum:]._%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}|[+]?[0-9][0-9 ()-]{7,}[0-9])' then
      raise exception 'Lead Generation accepts only bounded synthetic organization-level need data without identifiers or profile URLs';
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
    if agent_key not in ('ceo_operations_ai', 'career_discovery_ai', 'cv_linkedin_ai', 'lead_generation_ai') then
      raise exception 'Only CEO Operations AI, Career Discovery AI, CV & LinkedIn AI, and Lead Generation AI are in the current staged operational rollout';
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
    if agent_row.status <> 'live' or agent_row.active is not true
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
