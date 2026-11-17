-- Rehearsal candidate. Keep raw booking data private and expose the audited
-- coach/service card projections used by the anonymous server-rendered pages.
begin;
revoke all on table public.marketplace_coach_directory, public.marketplace_coach_discovery,
  public.marketplace_booking_requests, public.marketplace_booking_slots,
  public.marketplace_booking_events, public.marketplace_transactions,
  public.calendly_connections, public.calendly_oauth_states from anon;
grant execute on function public.get_public_coach_directory(), public.get_public_service_directory() to anon;
commit;
