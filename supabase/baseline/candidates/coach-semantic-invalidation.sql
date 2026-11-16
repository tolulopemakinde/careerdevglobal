-- LOCAL-ONLY candidate. No production application or migration authorization.
-- Keep the existing invalidation trigger SECURITY INVOKER. Permit only an
-- active coach's own derived-cache invalidation, never vector writes or reads.
BEGIN;
SET LOCAL search_path = pg_catalog, public, extensions;
GRANT SELECT (coach_id), UPDATE (embedding, source_text, updated_at)
  ON public.coach_semantic_profiles TO authenticated;
CREATE POLICY coach_semantic_owner_identifier ON public.coach_semantic_profiles
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.coaches c JOIN public.profiles p ON p.id=c.profile_id
      WHERE c.id=coach_semantic_profiles.coach_id AND c.profile_id=(SELECT auth.uid())
        AND p.role='coach' AND p.status='active')
  );
CREATE POLICY coach_semantic_owner_invalidation ON public.coach_semantic_profiles
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.coaches c JOIN public.profiles p ON p.id=c.profile_id
      WHERE c.id=coach_semantic_profiles.coach_id AND c.profile_id=(SELECT auth.uid())
        AND p.role='coach' AND p.status='active')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.coaches c JOIN public.profiles p ON p.id=c.profile_id
      WHERE c.id=coach_semantic_profiles.coach_id AND c.profile_id=(SELECT auth.uid())
        AND p.role='coach' AND p.status='active')
    AND embedding IS NULL
    AND source_text IS NOT DISTINCT FROM public.coach_semantic_source_text(coach_id)
    AND updated_at=transaction_timestamp()
  );

-- Row ownership alone does not authorize changing approval/publication fields.
-- No privilege escalation: this function and the original invalidator remain invokers.
CREATE FUNCTION public.guard_coach_publication_fields() RETURNS trigger
  LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $function$
DECLARE changed boolean;
BEGIN
  IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME NOT IN ('coaches','coach_marketplace_profiles')
      OR TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'Unsupported coach publication guard context' USING ERRCODE='42501';
  END IF;
  IF current_user='authenticated' AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id=auth.uid()
      AND p.status='active' AND p.role IN ('coach','staff','admin')
  ) THEN
    RAISE EXCEPTION 'An active authorized profile is required' USING ERRCODE='42501';
  END IF;
  IF TG_TABLE_NAME='coaches' THEN
    changed := NEW.id IS DISTINCT FROM OLD.id
      OR NEW.profile_id IS DISTINCT FROM OLD.profile_id
      OR NEW.application_status IS DISTINCT FROM OLD.application_status
      OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
      OR NEW.approved_at IS DISTINCT FROM OLD.approved_at;
  ELSE
    changed := NEW.id IS DISTINCT FROM OLD.id
      OR NEW.coach_id IS DISTINCT FROM OLD.coach_id
      OR NEW.verification_status IS DISTINCT FROM OLD.verification_status
      OR NEW.marketplace_status IS DISTINCT FROM OLD.marketplace_status
      OR NEW.profile_completion_pct IS DISTINCT FROM OLD.profile_completion_pct;
  END IF;
  -- Server-owned approval RPCs keep their existing independent authorization.
  -- This guard specifically protects direct authenticated-role row updates.
  IF current_user='authenticated' AND changed AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id=auth.uid()
      AND p.status='active' AND p.role IN ('staff','admin')
  ) THEN
    RAISE EXCEPTION 'Coach approval and publication require an authorized reviewer' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.guard_coach_publication_fields() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_coach_publication BEFORE UPDATE ON public.coaches
  FOR EACH ROW EXECUTE FUNCTION public.guard_coach_publication_fields();
CREATE TRIGGER guard_coach_publication BEFORE UPDATE ON public.coach_marketplace_profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_coach_publication_fields();
COMMIT;
