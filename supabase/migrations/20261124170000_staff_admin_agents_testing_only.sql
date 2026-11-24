-- Keep the seven Staff/Admin agents visible for review while denying operational
-- execution. The Admin test page now uses local deterministic fixtures and does
-- not need registry activation, database requests, or provider calls.
update public.ai_agent_registry
set status = 'testing',
    active = false,
    human_approval_required = true
where agent_key in (
  'ceo_operations_ai',
  'career_discovery_ai',
  'cv_linkedin_ai',
  'lead_generation_ai',
  'marketing_content_ai',
  'research_opportunities_ai',
  'sales_proposal_ai'
);

do $verification$
declare
  configured_count integer;
begin
  select count(*) into configured_count
  from public.ai_agent_registry
  where agent_key in (
    'ceo_operations_ai',
    'career_discovery_ai',
    'cv_linkedin_ai',
    'lead_generation_ai',
    'marketing_content_ai',
    'research_opportunities_ai',
    'sales_proposal_ai'
  )
    and status = 'testing'
    and active = false
    and human_approval_required = true;

  if configured_count <> 7 then
    raise exception 'Expected seven Staff/Admin agents to remain testing, inactive, and human-review-gated; found %', configured_count;
  end if;
end;
$verification$;
