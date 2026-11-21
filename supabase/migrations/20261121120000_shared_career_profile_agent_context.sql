-- Share only the authenticated client's own human-reviewed Career Intelligence
-- profile with client-facing agent workflows that explicitly declare this dependency.
-- Document facts and unreviewed profile versions are never selected here.

alter table public.interview_coach_sessions
  add column if not exists shared_profile_snapshot jsonb;

create or replace function public.get_my_shared_career_context()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_catalog'
as $function$
declare
  u uuid := auth.uid();
  role_name text;
  profile_row public.career_profiles%rowtype;
  profile_context jsonb := null;
  goal_context jsonb := '[]'::jsonb;
begin
  select role into role_name
  from public.profiles
  where id = u and status = 'active';

  if role_name <> 'client' or u is null then
    return jsonb_build_object(
      'included', false,
      'profile', null,
      'goals', '[]'::jsonb,
      'metadata', jsonb_build_object('reason', 'client_profile_not_available')
    );
  end if;

  select *
  into profile_row
  from public.career_profiles
  where client_id = u
    and is_current = true
    and human_reviewed = true
  order by updated_at desc, version desc
  limit 1;

  if found then
    profile_context := jsonb_strip_nulls(jsonb_build_object(
      'professional_summary', profile_row.professional_summary,
      'career_stage', profile_row.career_stage,
      'current_job_title', profile_row.current_job_title,
      'current_industry', profile_row.current_industry,
      'current_location', profile_row.current_location,
      'target_role', profile_row.target_role,
      'target_roles', profile_row.target_roles,
      'target_industry', profile_row.target_industry,
      'target_industries', profile_row.target_industries,
      'target_location', profile_row.target_location,
      'target_locations', profile_row.target_locations,
      'career_interests', profile_row.career_interests,
      'interests', profile_row.interests,
      'strengths_summary', profile_row.strengths_summary,
      'development_gaps_summary', profile_row.development_gaps_summary,
      'development_gaps', profile_row.development_gaps,
      'achievements', profile_row.achievements,
      'certifications', profile_row.certifications,
      'leadership_experience', profile_row.leadership_experience,
      'portfolio_evidence', profile_row.portfolio_evidence,
      'provenance', jsonb_build_object(
        'source', 'CareerDev Global Career Intelligence Profile',
        'profile_version', coalesce(profile_row.profile_version, profile_row.version),
        'review_status', 'human_reviewed',
        'reviewed_at', profile_row.human_reviewed_at
      )
    ));
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'goal', goals.goal,
        'priority', goals.priority,
        'target_date', goals.target_date,
        'provenance', 'client_stated'
      )
      order by goals.priority asc nulls last, goals.created_at desc
    ),
    '[]'::jsonb
  )
  into goal_context
  from (
    select goal, priority, target_date, created_at
    from public.career_goals
    where client_id = u and status = 'active'
    order by priority asc nulls last, created_at desc
    limit 10
  ) goals;

  return jsonb_build_object(
    'included', profile_context is not null or jsonb_array_length(goal_context) > 0,
    'profile', profile_context,
    'goals', goal_context,
    'metadata', jsonb_build_object(
      'source', 'CareerDev Global Career Intelligence',
      'profile_review_status', case when profile_context is null then 'not_available' else 'human_reviewed' end,
      'unreviewed_document_facts_included', false
    )
  );
end;
$function$;

revoke all on function public.get_my_shared_career_context() from public, anon;
grant execute on function public.get_my_shared_career_context() to authenticated;

create or replace function public.prepare_ai_agent_execution(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  role_name text;
  r public.ai_agent_execution_requests%rowtype;
  approval_required boolean;
  share_profile boolean := false;
  shared_context jsonb;
  e uuid;
  snapshot_count integer;
begin
  select role into role_name from public.profiles where id = u and status = 'active';
  if role_name not in ('admin','staff','coach','client') then
    raise exception 'Authorized CareerDev Global access required';
  end if;

  select * into r from public.ai_agent_execution_requests where id = p_request_id for update;
  if not found then raise exception 'Execution request not found'; end if;
  if role_name in ('coach','client') and r.requested_by <> u then
    raise exception 'User may only prepare own requests';
  end if;
  if r.status not in ('authorized','prepared') then
    raise exception 'Request is not ready for preparation';
  end if;

  select exists (
    select 1
    from public.ai_agent_registry ar
    join public.ai_agent_workflows aw on aw.agent_id = ar.id
    where ar.id = r.agent_id
      and ar.owner_role = 'client_coach'
      and aw.id = r.workflow_id
      and aw.active = true
      and aw.input_contract ->> 'career_profile' = 'shared'
  ) into share_profile;

  if role_name = 'client' and share_profile and r.status = 'authorized' then
    select public.get_my_shared_career_context() into shared_context;
    if coalesce((shared_context ->> 'included')::boolean, false) then
      r.input_payload := coalesce(r.input_payload, '{}'::jsonb)
        || jsonb_build_object(
          'shared_career_context', shared_context,
          'shared_career_profile', shared_context -> 'profile',
          'shared_career_goals', shared_context -> 'goals',
          'profile_context_metadata', shared_context -> 'metadata'
        );
      update public.ai_agent_execution_requests
      set input_payload = r.input_payload
      where id = r.id;
    end if;
  end if;

  select ar.human_approval_required into approval_required
  from public.ai_agent_registry ar where ar.id = r.agent_id;

  if r.execution_id is null then
    insert into public.ai_agent_executions(
      agent_id, workflow_id, status, trigger_source, input_snapshot,
      human_review_required, human_review_status, created_by
    )
    values(
      r.agent_id, r.workflow_id, 'authorized', r.trigger_source, r.input_payload,
      approval_required, case when approval_required then 'pending' else 'not_required' end, u
    )
    returning id into e;

    update public.ai_agent_execution_requests
    set execution_id = e, status = 'prepared'
    where id = r.id;
  else
    e := r.execution_id;
    update public.ai_agent_execution_requests
    set status = 'prepared'
    where id = r.id;
  end if;

  select public.capture_ai_agent_configuration_snapshot(e) into snapshot_count;

  insert into public.ai_agent_execution_events(
    request_id, execution_id, event_type, event_data, actor_id
  )
  values(
    r.id, e, 'configuration_captured',
    jsonb_build_object('snapshot_count', snapshot_count), u
  );

  return jsonb_build_object(
    'request_id', r.id,
    'execution_id', e,
    'snapshot_count', snapshot_count,
    'status', 'prepared',
    'shared_profile_included', coalesce((shared_context ->> 'included')::boolean, false)
  );
end;
$function$;

update public.ai_agent_workflows aw
set input_contract = aw.input_contract || jsonb_build_object('career_profile', 'shared')
from public.ai_agent_registry ar
where ar.id = aw.agent_id
  and ar.agent_key = 'interview_coach_agent'
  and aw.workflow_key = 'interview_coach_agent_session';
