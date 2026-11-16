-- LOCAL-ONLY rollback for exactly coach-semantic-invalidation.sql.
-- Does not touch the recovered historical invalidator or any application rows.
BEGIN;
DROP TRIGGER guard_coach_publication ON public.coaches;
DROP TRIGGER guard_coach_publication ON public.coach_marketplace_profiles;
DROP FUNCTION public.guard_coach_publication_fields();
DROP POLICY coach_semantic_owner_identifier ON public.coach_semantic_profiles;
DROP POLICY coach_semantic_owner_invalidation ON public.coach_semantic_profiles;
REVOKE SELECT (coach_id), UPDATE (embedding, source_text, updated_at)
  ON public.coach_semantic_profiles FROM authenticated;
COMMIT;
