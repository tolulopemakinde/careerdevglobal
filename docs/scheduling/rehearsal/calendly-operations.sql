-- Forward-only candidate for a disposable database. Keep outside supabase/migrations
-- until the full schema, callers, provider permissions and rollback are rehearsed.
begin;

create schema careerdev_scheduling_private;
revoke all on schema careerdev_scheduling_private from public, anon, authenticated;
grant usage on schema careerdev_scheduling_private to service_role;

create table careerdev_scheduling_private.calendly_operations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.marketplace_booking_requests(id),
  kind text not null check (kind in ('confirm', 'cancel')),
  actor_id uuid not null references public.profiles(id),
  actor_type text not null check (actor_type in ('client', 'coach')),
  state text not null default 'external_pending'
    check (state in ('external_pending', 'reconciliation_required', 'succeeded')),
  slot_id uuid references public.marketplace_booking_slots(id),
  provider_user_uri text not null,
  provider_type_uri text,
  provider_event_uri text,
  provider_invitee_uri text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id, kind),
  check (ends_at > starts_at),
  check (kind <> 'confirm' or (slot_id is not null and provider_type_uri is not null)),
  check (kind <> 'cancel' or provider_event_uri is not null),
  check (kind <> 'confirm' or state <> 'succeeded'
    or (provider_event_uri is not null and provider_invitee_uri is not null))
);
create unique index calendly_confirmation_event_uidx
  on careerdev_scheduling_private.calendly_operations(provider_event_uri)
  where kind = 'confirm' and provider_event_uri is not null;
alter table careerdev_scheduling_private.calendly_operations enable row level security;
grant select, insert, update on careerdev_scheduling_private.calendly_operations to service_role;

-- The Edge caller supplies the profile from a verified JWT. This function
-- rechecks authorization and the exact data used in provider preflight under
-- locks. A committed new operation is the only permission to attempt a POST.
create function public.begin_calendly_operation(
  p_booking_id uuid, p_actor_id uuid, p_kind text, p_snapshot jsonb
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  booking public.marketplace_booking_requests%rowtype;
  operation careerdev_scheduling_private.calendly_operations%rowtype;
  actor_type text;
  provider_type text;
  provider_user text;
  held_slot uuid;
begin
  if p_kind is null or p_kind not in ('confirm', 'cancel') then
    raise exception 'Unsupported booking operation' using errcode = '22023';
  end if;
  select * into booking from public.marketplace_booking_requests
    where id = p_booking_id for update;
  if not found then
    raise exception 'Booking unavailable' using errcode = '42501';
  end if;

  select 'coach' into actor_type from public.coaches c
    where c.id = booking.coach_id and c.profile_id = p_actor_id
      and c.application_status::text in ('approved', 'active')
    for share;
  if actor_type is null and p_kind = 'cancel' then
    select 'client' into actor_type from public.clients c
      where c.id = booking.client_id and c.profile_id = p_actor_id for share;
  end if;
  if actor_type is null then
    raise exception 'Booking unavailable' using errcode = '42501';
  end if;

  select * into operation from careerdev_scheduling_private.calendly_operations
    where booking_id = booking.id and kind = p_kind;
  if found then
    return to_jsonb(operation) || '{"dispatch":false}'::jsonb;
  end if;
  if p_snapshot is null then
    return null;
  end if;
  if exists (
    select 1 from careerdev_scheduling_private.calendly_operations o
      where o.booking_id = booking.id and o.state <> 'succeeded'
  ) then
    raise exception 'Another scheduling operation requires reconciliation';
  end if;

  select c.calendly_user_uri into provider_user from public.calendly_connections c
    where c.coach_id = booking.coach_id and c.active for share;
  if provider_user is null or provider_user is distinct from p_snapshot->>'provider_user_uri'
    or booking.requested_start is distinct from (p_snapshot->>'starts_at')::timestamptz
    or booking.requested_end is distinct from (p_snapshot->>'ends_at')::timestamptz then
    raise exception 'Booking or connection changed during verification';
  end if;

  if p_kind = 'confirm' then
    if booking.booking_status <> 'requested' or booking.requested_start <= now()
      or booking.calendly_event_uri is not null or booking.calendly_invitee_uri is not null
      or booking.calendly_booking_status is not null then
      raise exception 'Booking is ineligible for a new Calendly appointment';
    end if;
    select o.calendly_event_type_uri into provider_type from public.coach_service_offerings o
      join public.services s on s.id = o.service_id
      where o.id = booking.coach_service_offering_id and o.coach_id = booking.coach_id
        and o.service_id = booking.service_id and o.active and s.active
        and booking.requested_end - booking.requested_start = make_interval(mins => o.duration_minutes)
      for share of o, s;
    if provider_type is null or provider_type is distinct from p_snapshot->>'provider_type_uri' then
      raise exception 'Event type or duration changed during verification';
    end if;
    insert into public.marketplace_booking_slots
      (coach_id, start_at, end_at, timezone, status, booking_id)
    values (booking.coach_id, booking.requested_start, booking.requested_end,
      coalesce(booking.timezone, 'UTC'), 'held', booking.id)
    returning id into held_slot;
  elsif booking.booking_status not in ('confirmed', 'awaiting_payment', 'funded', 'scheduled')
    or booking.calendly_event_uri is null or booking.calendly_invitee_uri is null
    or booking.calendly_event_uri is distinct from p_snapshot->>'provider_event_uri'
    or booking.calendly_invitee_uri is distinct from p_snapshot->>'provider_invitee_uri' then
    raise exception 'Booking is ineligible for Calendly cancellation';
  end if;

  insert into careerdev_scheduling_private.calendly_operations
    (booking_id, kind, actor_id, actor_type, slot_id, provider_user_uri, provider_type_uri,
      provider_event_uri, provider_invitee_uri, starts_at, ends_at)
  values (booking.id, p_kind, p_actor_id, actor_type, held_slot, provider_user, provider_type,
    booking.calendly_event_uri, booking.calendly_invitee_uri, booking.requested_start, booking.requested_end)
  returning * into operation;
  return to_jsonb(operation) || '{"dispatch":true}'::jsonb;
end;
$$;

-- An ambiguous provider result keeps the hold. There is no expiry or reset
-- transition that could let a replay issue another invitee POST.
create function public.flag_calendly_operation(p_operation_id uuid)
returns void language sql security invoker set search_path = ''
as $$
  update careerdev_scheduling_private.calendly_operations
    set state = 'reconciliation_required', updated_at = now()
    where id = p_operation_id and state = 'external_pending';
$$;

-- Persist canonical response identifiers before further provider reads. Treat
-- them as an unverified receipt until finish_calendly_operation succeeds.
create function public.record_calendly_receipt(
  p_operation_id uuid, p_event_uri text, p_invitee_uri text
) returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  if p_event_uri is null or p_event_uri !~ '^https://api[.]calendly[.]com/scheduled_events/[A-Za-z0-9-]+$'
    or p_invitee_uri is null or left(p_invitee_uri, length(p_event_uri) + 10) <> p_event_uri || '/invitees/'
    or substring(p_invitee_uri from length(p_event_uri) + 11) !~ '^[A-Za-z0-9-]+$' then
    raise exception 'Invalid provider identifiers';
  end if;
  update careerdev_scheduling_private.calendly_operations
    set provider_event_uri = p_event_uri, provider_invitee_uri = p_invitee_uri, updated_at = now()
    where id = p_operation_id and kind = 'confirm'
      and (provider_event_uri is null or provider_event_uri = p_event_uri)
      and (provider_invitee_uri is null or provider_invitee_uri = p_invitee_uri);
  if not found then
    raise exception 'Conflicting provider receipt';
  end if;
end;
$$;

-- Provider evidence must be fetched and validated by the server. Serialize
-- completion on the same booking row and commit status, slot and event together.
create function public.finish_calendly_operation(
  p_booking_id uuid, p_operation_id uuid, p_event_uri text, p_invitee_uri text
) returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  booking public.marketplace_booking_requests%rowtype;
  operation careerdev_scheduling_private.calendly_operations%rowtype;
  event_type text;
begin
  select * into strict booking from public.marketplace_booking_requests
    where id = p_booking_id for update;
  select * into strict operation from careerdev_scheduling_private.calendly_operations
    where id = p_operation_id and booking_id = p_booking_id for update;
  if p_event_uri is null or p_event_uri !~ '^https://api[.]calendly[.]com/scheduled_events/[A-Za-z0-9-]+$'
    or p_invitee_uri is null or left(p_invitee_uri, length(p_event_uri) + 10) <> p_event_uri || '/invitees/'
    or substring(p_invitee_uri from length(p_event_uri) + 11) !~ '^[A-Za-z0-9-]+$' then
    raise exception 'Invalid provider identifiers';
  end if;
  if operation.state = 'succeeded' then
    if operation.provider_event_uri = p_event_uri and operation.provider_invitee_uri = p_invitee_uri then
      return;
    end if;
    raise exception 'Provider evidence differs from committed result';
  end if;
  if booking.requested_start is distinct from operation.starts_at
    or booking.requested_end is distinct from operation.ends_at then
    raise exception 'Booking timing changed while provider operation was pending';
  end if;

  if operation.kind = 'confirm' then
    if booking.booking_status <> 'requested' or booking.calendly_event_uri is not null
      or booking.calendly_invitee_uri is not null
      or (operation.provider_event_uri is not null and operation.provider_event_uri <> p_event_uri)
      or (operation.provider_invitee_uri is not null and operation.provider_invitee_uri <> p_invitee_uri) then
      raise exception 'Booking changed while confirmation was pending';
    end if;
    update public.marketplace_booking_slots set status = 'booked', updated_at = now()
      where id = operation.slot_id and booking_id = booking.id and status = 'held'
        and coach_id = booking.coach_id and start_at = operation.starts_at and end_at = operation.ends_at;
    if not found then
      raise exception 'Booking hold missing';
    end if;
    update public.marketplace_booking_requests
      set booking_status = 'confirmed', calendly_booking_status = 'booked',
        calendly_event_uri = p_event_uri, calendly_invitee_uri = p_invitee_uri,
        calendly_last_error = null, updated_at = now()
      where id = booking.id;
    event_type := 'confirmed';
  else
    if booking.booking_status not in ('confirmed', 'awaiting_payment', 'funded', 'scheduled')
      or booking.calendly_event_uri is distinct from p_event_uri
      or booking.calendly_invitee_uri is distinct from p_invitee_uri
      or operation.provider_event_uri is distinct from p_event_uri
      or operation.provider_invitee_uri is distinct from p_invitee_uri then
      raise exception 'Booking changed while cancellation was pending';
    end if;
    update public.marketplace_booking_requests
      set booking_status = 'cancelled', calendly_booking_status = 'cancelled', updated_at = now()
      where id = booking.id;
    update public.marketplace_booking_slots set status = 'cancelled', updated_at = now()
      where booking_id = booking.id and status in ('held', 'booked');
    event_type := 'cancelled';
  end if;
  insert into public.marketplace_booking_events (booking_id, event_type, actor_type, actor_id, event_data)
    values (booking.id, event_type, operation.actor_type, operation.actor_id,
      jsonb_build_object('operation_id', operation.id));
  update careerdev_scheduling_private.calendly_operations
    set state = 'succeeded', provider_event_uri = p_event_uri,
      provider_invitee_uri = p_invitee_uri, updated_at = now()
    where id = operation.id;
end;
$$;

revoke all on function public.begin_calendly_operation(uuid, uuid, text, jsonb),
  public.flag_calendly_operation(uuid), public.finish_calendly_operation(uuid, uuid, text, text),
  public.record_calendly_receipt(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.begin_calendly_operation(uuid, uuid, text, jsonb),
  public.flag_calendly_operation(uuid), public.finish_calendly_operation(uuid, uuid, text, text),
  public.record_calendly_receipt(uuid, text, text)
  to service_role;
commit;
