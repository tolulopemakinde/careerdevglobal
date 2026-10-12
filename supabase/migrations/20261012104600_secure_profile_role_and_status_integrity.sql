-- Profile authorization hardening for public pilot.
-- Ordinary signed-in users may only create their own active client profile.
-- Users may not change their own role or status; trusted admin flows may update other users.

BEGIN;

DROP POLICY IF EXISTS "users can create own profile" ON public.profiles;
CREATE POLICY "users can create own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    id = (SELECT auth.uid())
    AND role = 'client'::public.user_role
    AND status = 'active'
  );

CREATE OR REPLACE FUNCTION public.prevent_profile_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF OLD.id = auth.uid()
     AND (OLD.role IS DISTINCT FROM NEW.role
          OR OLD.status IS DISTINCT FROM NEW.status) THEN
    RAISE EXCEPTION 'Users cannot change their own role or status';
  END IF;
  RETURN NEW;
END;
$function$;

COMMIT;
