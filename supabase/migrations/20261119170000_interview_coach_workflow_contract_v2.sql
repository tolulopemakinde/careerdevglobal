-- Keep the registered workflow contract aligned with the interactive coach response.
update public.ai_agent_workflows w
set active = false
from public.ai_agent_registry a
where w.agent_id = a.id
  and a.agent_key = 'interview_coach_agent'
  and w.workflow_key = 'interview_coach_agent_session'
  and w.active = true;

insert into public.ai_agent_workflows (
  agent_id, workflow_key, workflow_name, trigger_type,
  input_contract, output_contract, dependencies, active, version
)
select
  a.id,
  'interview_coach_agent_session',
  'Interactive Interview Coach Session',
  'manual',
  jsonb_build_object(
    'required', jsonb_build_array('session_id','turn_index','context'),
    'context_fields', jsonb_build_array('job_role','industry','company_name','job_description','candidate_context','company_context','job_criteria')
  ),
  jsonb_build_object(
    'required', jsonb_build_array('question','competency','follow_up','answer_feedback','finished','job_criteria','final_feedback'),
    'final_feedback_required', jsonb_build_array('overall','strengths','improvements','practice_plan','criteria_assessments'),
    'criteria_assessment_required', jsonb_build_array('criterion','assessment','evidence','gap','next_step')
  ),
  jsonb_build_object('shared_profile', true, 'company_research', 'user_supplied_only', 'external_provider', 'free_tier_only'),
  true,
  2
from public.ai_agent_registry a
where a.agent_key = 'interview_coach_agent'
  and a.active = true
on conflict (agent_id, workflow_key, version) do nothing;
