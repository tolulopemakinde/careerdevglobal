-- LOCAL-ONLY candidate: not a migration and not production-authorized.
BEGIN;
SET LOCAL search_path=pg_catalog,public,extensions;
GRANT EXECUTE ON FUNCTION public.get_public_coach_directory() TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_service_directory() TO anon;
ALTER POLICY "career_profile_versions_select" ON public.career_profile_versions USING ((EXISTS(SELECT 1 FROM public.clients c WHERE c.id=career_profile_versions.client_id AND c.profile_id=auth.uid())
 OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.status='active' AND p.role IN ('staff','admin'))
 OR EXISTS(SELECT 1 FROM public.service_requests r JOIN public.profiles p ON p.id=auth.uid() WHERE r.client_id=career_profile_versions.client_id AND r.assigned_coach=auth.uid() AND p.status='active' AND p.role='coach')));
ALTER POLICY "profile_comparisons_select" ON public.career_profile_comparisons USING ((EXISTS(SELECT 1 FROM public.clients c WHERE c.id=career_profile_comparisons.client_id AND c.profile_id=auth.uid())
 OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.status='active' AND p.role IN ('staff','admin'))
 OR EXISTS(SELECT 1 FROM public.service_requests r JOIN public.profiles p ON p.id=auth.uid() WHERE r.client_id=career_profile_comparisons.client_id AND r.assigned_coach=auth.uid() AND p.status='active' AND p.role='coach')));
ALTER POLICY "quality runs select" ON public.career_profile_quality_runs USING ((EXISTS(SELECT 1 FROM public.clients c WHERE c.id=career_profile_quality_runs.client_id AND c.profile_id=auth.uid())
 OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.status='active' AND p.role IN ('staff','admin'))
 OR EXISTS(SELECT 1 FROM public.service_requests r JOIN public.profiles p ON p.id=auth.uid() WHERE r.client_id=career_profile_quality_runs.client_id AND r.assigned_coach=auth.uid() AND p.status='active' AND p.role='coach')));
ALTER POLICY "document_processing_jobs_select_authorized" ON public.document_processing_jobs USING ((EXISTS(SELECT 1 FROM public.clients c WHERE c.id=document_processing_jobs.client_id AND c.profile_id=auth.uid())
 OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.status='active' AND p.role IN ('staff','admin'))
 OR EXISTS(SELECT 1 FROM public.service_requests r JOIN public.profiles p ON p.id=auth.uid() WHERE r.client_id=document_processing_jobs.client_id AND r.assigned_coach=auth.uid() AND p.status='active' AND p.role='coach')));
CREATE OR REPLACE FUNCTION public.find_public_coach_matches(p_query_embedding vector, p_mode text DEFAULT 'Any format'::text, p_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with eligible as (
    select cmp.coach_id,cmp.display_name,cmp.headline,cmp.bio,cmp.specializations,cmp.coaching_formats,cmp.languages,cmp.timezone,cmp.country,cmp.years_coaching,
      1-(csp.embedding OPERATOR(extensions.<=>) p_query_embedding) semantic_score
    from public.coach_marketplace_profiles cmp
    join public.coaches c on c.id=cmp.coach_id and c.application_status::text in ('approved','active')
    join public.coach_semantic_profiles csp on csp.coach_id=cmp.coach_id
    join public.coach_marketplace_onboarding cbo on cbo.coach_id=cmp.coach_id
    where cmp.verification_status='verified' and cmp.marketplace_status='active'
      and csp.embedding is not null
      and cbo.onboarding_status='active' and cbo.required_agreements_accepted=true and cbo.eligible_for_activation=true
      and exists(select 1 from public.coach_availability ca where ca.coach_id=cmp.coach_id and ca.active=true)
  ), scored as (
    select e.*,
      case when p_mode='Any format' or p_mode=any(e.coaching_formats) then 1 else 0 end mode_fit
    from eligible e
  ), ranked as (
    select *,round((semantic_score*75+mode_fit*25)::numeric,2) combined_score
    from scored
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.combined_score desc),'[]'::jsonb)
  from (
    select coach_id,display_name,headline,bio,specializations,coaching_formats,languages,timezone,country,years_coaching,
      round((semantic_score*100)::numeric,2) semantic_score,combined_score,
      array_remove(array[case when semantic_score>=0.75 then 'Strong goal and expertise alignment' end,case when mode_fit=1 then 'Preferred coaching format matches' end],null) match_reasons,
      array_remove(array[case when mode_fit=0 then 'Preferred coaching format differs' end],null) mismatch_flags
    from ranked order by combined_score desc limit greatest(1,least(p_limit,20))
  ) x;
$function$;
CREATE OR REPLACE FUNCTION public.get_public_coach_matching_candidates(p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.display_name),'[]'::jsonb)
  from (
    select cmp.coach_id, cmp.display_name, cmp.headline, cmp.bio,
      cmp.specializations, cmp.coaching_formats, cmp.languages,
      cmp.timezone, cmp.country, cmp.years_coaching,
      public.coach_semantic_source_text(cmp.coach_id) as source_text,
      (csp.embedding is not null) as has_embedding
    from public.coach_marketplace_profiles cmp
    join public.coaches c on c.id=cmp.coach_id
    join public.coach_marketplace_onboarding cbo on cbo.coach_id=c.id
    left join public.coach_semantic_profiles csp on csp.coach_id=cmp.coach_id
    where cmp.verification_status='verified'
      and cmp.marketplace_status='active'
      and c.application_status::text in ('approved','active')
      and cbo.onboarding_status='active' and cbo.required_agreements_accepted=true and cbo.eligible_for_activation=true
      and exists(select 1 from public.coach_availability ca where ca.coach_id=cmp.coach_id and ca.active=true and ca.end_time>ca.start_time)
    limit greatest(1,least(p_limit,50))
  ) x;
$function$;
COMMIT;
