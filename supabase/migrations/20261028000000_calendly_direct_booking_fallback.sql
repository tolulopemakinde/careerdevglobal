-- Add an optional per-offering Calendly link for direct scheduling while OAuth is unavailable.
-- The fallback deliberately does not create CareerDev marketplace bookings or payment records.
ALTER TABLE public.coach_service_offerings
  ADD COLUMN calendly_booking_url text;

ALTER TABLE public.coach_service_offerings
  ADD CONSTRAINT coach_service_offerings_calendly_booking_url_check
  CHECK (
    calendly_booking_url IS NULL
    OR calendly_booking_url ~* '^https://([a-z0-9-]+\.)*calendly\.com/[^[:space:]#]+$'
  );

CREATE FUNCTION public.get_public_calendly_booking_links(p_coach_id uuid DEFAULT NULL)
RETURNS TABLE(offering_id uuid, coach_id uuid, calendly_booking_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT o.id, o.coach_id, o.calendly_booking_url
  FROM public.coach_service_offerings AS o
  JOIN public.services AS s ON s.id = o.service_id AND s.active = true
  JOIN public.coaches AS c ON c.id = o.coach_id
  JOIN public.coach_marketplace_profiles AS p ON p.coach_id = c.id
  WHERE o.active = true
    AND o.calendly_booking_url IS NOT NULL
    AND p.verification_status = 'verified'
    AND p.marketplace_status = 'active'
    AND c.application_status::text IN ('approved', 'active')
    AND (p_coach_id IS NULL OR c.id = p_coach_id)
  ORDER BY o.id;
$function$;

REVOKE ALL ON FUNCTION public.get_public_calendly_booking_links(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_calendly_booking_links(uuid) TO anon, authenticated;
