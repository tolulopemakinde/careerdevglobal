-- Apply after calendly-operations.sql in the disposable rehearsal database.
begin;

create function public.get_calendly_reschedule_context(p_booking_id uuid, p_actor_id uuid)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  context jsonb;
begin
  select jsonb_build_object(
    'provider_event_uri', b.calendly_event_uri,
    'provider_invitee_uri', b.calendly_invitee_uri,
    'provider_user_uri', c.calendly_user_uri,
    'provider_type_uri', o.provider_type_uri,
    'starts_at', b.requested_start,
    'ends_at', b.requested_end
  ) into context
  from public.marketplace_booking_requests b
  join public.clients client on client.id = b.client_id and client.profile_id = p_actor_id
  join careerdev_scheduling_private.calendly_operations o
    on o.booking_id = b.id and o.kind = 'confirm' and o.state = 'succeeded'
  join public.calendly_connections c
    on c.coach_id = b.coach_id and c.active and c.calendly_user_uri = o.provider_user_uri
  where b.id = p_booking_id
    and b.booking_status in ('confirmed', 'awaiting_payment', 'funded', 'scheduled')
    and b.calendly_event_uri is not null and b.calendly_invitee_uri is not null
    and not exists (
      select 1 from careerdev_scheduling_private.calendly_operations pending
      where pending.booking_id = b.id and pending.state <> 'succeeded'
    );
  if context is null then
    raise exception 'Rescheduling is unavailable' using errcode = '42501';
  end if;
  return context;
end;
$$;

-- Only the authenticated server boundary can submit Calendly evidence.
-- Serialize with confirmation/cancellation and leave payment state intact.
create function public.apply_calendly_reschedule(p_booking_id uuid, p_actor_id uuid, p_evidence jsonb)
returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  booking public.marketplace_booking_requests%rowtype;
  context jsonb;
  new_event text := p_evidence->>'replacement_event_uri';
  new_invitee text := p_evidence->>'replacement_invitee_uri';
  new_start timestamptz := (p_evidence->>'replacement_start')::timestamptz;
  new_end timestamptz := (p_evidence->>'replacement_end')::timestamptz;
  moved_slot uuid;
begin
  select * into booking from public.marketplace_booking_requests where id = p_booking_id for update;
  context := public.get_calendly_reschedule_context(p_booking_id, p_actor_id);
  if new_event is null or new_event !~ '^https://api[.]calendly[.]com/scheduled_events/[A-Za-z0-9-]+$'
    or new_invitee is null or left(new_invitee, length(new_event) + 10) <> new_event || '/invitees/'
    or substring(new_invitee from length(new_event) + 11) !~ '^[A-Za-z0-9-]+$'
    or new_event = p_evidence->>'provider_event_uri'
    or new_start is null or new_end is null or not isfinite(new_start) or not isfinite(new_end)
    or new_end - new_start <> booking.requested_end - booking.requested_start then
    raise exception 'Invalid replacement event';
  end if;
  if booking.calendly_event_uri = new_event and booking.calendly_invitee_uri = new_invitee
    and booking.requested_start = new_start and booking.requested_end = new_end then
    return;
  end if;
  if new_start <= now() or context is distinct from
    (p_evidence - array['replacement_event_uri', 'replacement_invitee_uri', 'replacement_start', 'replacement_end']) then
    raise exception 'Booking changed during Calendly verification';
  end if;

  update public.marketplace_booking_slots
    set start_at = new_start, end_at = new_end, updated_at = now()
    where booking_id = booking.id and coach_id = booking.coach_id and status = 'booked'
      and start_at = booking.requested_start and end_at = booking.requested_end
    returning id into strict moved_slot;
  update public.marketplace_booking_requests
    set requested_start = new_start, requested_end = new_end,
      calendly_event_uri = new_event, calendly_invitee_uri = new_invitee,
      meeting_platform = null, meeting_platform_label = null,
      meeting_join_url = null, meeting_location_details = null, updated_at = now()
    where id = booking.id;
  insert into public.marketplace_booking_events (booking_id, event_type, actor_type, actor_id, event_data)
    values (booking.id, 'rescheduled', 'client', p_actor_id,
      jsonb_build_object('slot_id', moved_slot, 'previous_start', booking.requested_start,
        'replacement_start', new_start));
end;
$$;

revoke all on function public.get_calendly_reschedule_context(uuid, uuid),
  public.apply_calendly_reschedule(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.get_calendly_reschedule_context(uuid, uuid),
  public.apply_calendly_reschedule(uuid, uuid, jsonb) to service_role;
commit;
