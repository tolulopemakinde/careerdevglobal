-- REVIEW PROPOSAL ONLY. NOT A MIGRATION. DO NOT APPLY.
-- 2026-11-04 catalog evidence: catalog-evidence-2026-11-04.json.
-- Every candidate statement below is commented out deliberately.
-- No historical migrations are reconstructed. No SQL was executed from this file.
-- A reviewer must complete the cancellation/request-idempotency contracts,
-- acquire a provenance-safe baseline, and rehearse in a NEW isolated project.
-- The existing seeded test project and Production are excluded.

/*
PART A: minimal correction inside the EXISTING request RPC, preserving its
signature, ownership/approval checks and transaction boundaries.

Replace the incompatible event INSERT (actor_profile_id, metadata,
'booking_requested') with the observed table columns and allowed event type:

INSERT INTO public.marketplace_booking_events
  (booking_id, event_type, actor_type, actor_id, event_data)
VALUES
  (v_booking.id, 'requested', 'client', auth.uid(),
   jsonb_build_object('source', 'coach_profile'));

Add before INSERT, after checking auth.uid():

IF p_start_at IS NULL OR p_end_at IS NULL OR p_start_at <= now()
   OR p_end_at <= p_start_at THEN
  RAISE EXCEPTION 'A valid future booking time is required';
END IF;
IF p_timezone IS NULL OR NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = p_timezone
) THEN
  RAISE EXCEPTION 'A valid IANA timezone is required';
END IF;

This is NOT a complete request-hardening migration. The full replacement must
also derive client/coach/service/end time server-side, validate ownership of a
non-null service_request_id against its observed schema, check active service
and approved coach, and use a stable client-scoped request key with payload
comparison and unique constraint. Do not accept caller-supplied booking status,
Calendly metadata, ownership, price, payment state or audit identity.

Before implementing request v2, choose a compatibility wrapper preserving the
existing 8-argument caller. Never add a defaulted overload that makes PostgREST
dispatch ambiguous. Tests must cover old callers and login restoration.
*/

/*
PART B: candidate durable operation state, separate from booking_status.
This avoids inventing 'confirming' in the existing booking_status constraint.
Use the existing exclusion constraint on marketplace_booking_slots.

CREATE SCHEMA careerdev_scheduling_private;
REVOKE ALL ON SCHEMA careerdev_scheduling_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA careerdev_scheduling_private TO service_role;

CREATE TABLE careerdev_scheduling_private.operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.marketplace_booking_requests(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('confirm', 'cancel', 'reschedule')),
  actor_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  state text NOT NULL CHECK (state IN ('claimed','external_pending','succeeded','failed','reconciliation_required')),
  event_type_uri text,
  requested_start timestamptz NOT NULL,
  requested_end timestamptz NOT NULL,
  provider_event_uri text,
  provider_invitee_uri text,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, kind)
);
ALTER TABLE careerdev_scheduling_private.operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON careerdev_scheduling_private.operations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON careerdev_scheduling_private.operations TO service_role;

Do not expose the private schema through the Data API. A service-only public
wrapper may use SECURITY INVOKER and the service_role grants above. Its default
PUBLIC EXECUTE must be revoked in the same transaction before exposure.
The Edge Function must validate the user's JWT with auth.getUser BEFORE using
its server client. p_actor_profile_id must come from that validated identity,
never from the browser's request body.
*/

/*
PART C: candidate service-only atomic confirmation claim.
Before this RPC the Edge Function performs READ-only provider checks: connected
coach, canonical event URI, active type, host membership, matching duration,
required location answers, and current Calendly availability. Recheck immediately
before POST /invitees. These reads are not a reservation with Calendly.

CREATE FUNCTION public.claim_calendly_confirmation_v2(
  p_booking_id uuid, p_actor_profile_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp
AS $body$
DECLARE
  b public.marketplace_booking_requests%rowtype;
  op careerdev_scheduling_private.operations%rowtype;
  mapped_uri text;
BEGIN
  IF p_actor_profile_id IS NULL THEN RAISE EXCEPTION 'Verified actor required'; END IF;
  SELECT * INTO b FROM public.marketplace_booking_requests
    WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.coaches c
    WHERE c.id=b.coach_id AND c.profile_id=p_actor_profile_id
      AND c.application_status::text IN ('approved','active')
  ) THEN RAISE EXCEPTION 'Unauthorized coach'; END IF;

  SELECT * INTO op FROM careerdev_scheduling_private.operations
    WHERE booking_id=b.id AND kind='confirm';
  IF FOUND THEN
    -- The server MUST NOT issue another POST for any existing operation.
    -- succeeded => replay persisted result; pending/failed => reconcile first.
    RETURN jsonb_build_object('operation_id',op.id,'state',op.state,'create_allowed',false);
  END IF;
  IF b.booking_status <> 'requested' OR b.requested_start <= now()
    OR b.calendly_event_uri IS NOT NULL THEN
    RAISE EXCEPTION 'Booking cannot be newly confirmed';
  END IF;
  SELECT o.calendly_event_type_uri INTO mapped_uri
    FROM public.coach_service_offerings o
    JOIN public.services s ON s.id=o.service_id AND s.active
    WHERE o.id=b.coach_service_offering_id AND o.coach_id=b.coach_id
      AND o.active AND o.service_id=b.service_id
      AND extract(epoch FROM (b.requested_end-b.requested_start))/60=o.duration_minutes;
  IF mapped_uri IS NULL THEN RAISE EXCEPTION 'Valid event mapping required'; END IF;
  IF EXISTS (SELECT 1 FROM careerdev_scheduling_private.operations
      WHERE booking_id=b.id AND kind IN ('cancel','reschedule')
        AND state IN ('claimed','external_pending','reconciliation_required')) THEN
    RAISE EXCEPTION 'Booking has another pending operation';
  END IF;

  INSERT INTO careerdev_scheduling_private.operations
    (booking_id,kind,actor_profile_id,state,event_type_uri,requested_start,requested_end)
  VALUES(b.id,'confirm',p_actor_profile_id,'claimed',mapped_uri,b.requested_start,b.requested_end)
  RETURNING * INTO op;
  -- Existing GiST exclusion constraint rejects overlaps across DIFFERENT bookings.
  INSERT INTO public.marketplace_booking_slots
    (coach_id,start_at,end_at,timezone,status,booking_id)
  VALUES(b.coach_id,b.requested_start,b.requested_end,b.timezone,'held',b.id);
  INSERT INTO public.marketplace_booking_events
    (booking_id,event_type,actor_type,actor_id,event_data)
  VALUES(b.id,'held','coach',p_actor_profile_id,jsonb_build_object('operation_id',op.id));
  RETURN jsonb_build_object('operation_id',op.id,'state',op.state,'create_allowed',true);
END;
$body$;
REVOKE ALL ON FUNCTION public.claim_calendly_confirmation_v2(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_calendly_confirmation_v2(uuid,uuid) TO service_role;

The Edge Function needs a SECOND atomic operation that changes exactly one
claimed row to external_pending using UPDATE ... WHERE state='claimed' RETURNING.
Only that successful caller may send POST /invitees. Never infer permission from
an already-existing claimed/pending operation. A crash before/after this mark
requires reconciliation; no time-based lease expiry may blindly re-create an
appointment. Do not assume Calendly supports an Idempotency-Key header.
*/

/*
PART D: finalization transaction contract (candidate SQL fragments).
Implement as a service-only invoker RPC with explicit operation ID and verified
actor. Lock the BOOKING first and OPERATION second in all claim/finalize/cancel
paths. Revalidate state, immutable payload and assigned coach. Require canonical
provider event/invitee URIs from a verified provider response, not browser data.

UPDATE public.marketplace_booking_slots
SET status='booked',updated_at=now()
WHERE booking_id=b.id AND status='held'
  AND start_at=op.requested_start AND end_at=op.requested_end;
-- Require ROW_COUNT=1; raise and roll back otherwise.

UPDATE public.marketplace_booking_requests
SET booking_status='confirmed',calendly_booking_status='booked',
    calendly_event_uri=p_verified_event_uri,
    calendly_invitee_uri=p_verified_invitee_uri,
    calendly_last_error=NULL,
    meeting_platform=p_verified_platform,
    meeting_platform_label=p_verified_platform_label,
    meeting_join_url=p_verified_https_join_url,
    updated_at=now()
WHERE id=b.id AND booking_status='requested'
  AND requested_start=op.requested_start AND requested_end=op.requested_end;
-- Require ROW_COUNT=1. Append the observed 'confirmed' audit event in this tx.

UPDATE careerdev_scheduling_private.operations
SET state='succeeded',provider_event_uri=p_verified_event_uri,
    provider_invitee_uri=p_verified_invitee_uri,updated_at=now()
WHERE id=op.id AND state='external_pending';
-- Require ROW_COUNT=1. Booking notification/reminder triggers remain in place.
-- Do not call the legacy confirmation RPC: it inserts a SECOND slot and assumes auth.uid().

No payment/transaction rows are overwritten or deleted. Existing transaction
records retain IDs, prices, currency, provider references and audit history.
The missing client transaction-creation step needs a separately reviewed,
idempotent integration with create_marketplace_transaction before checkout.
*/

/*
PART E: failure, cancellation and rescheduling contracts still to implement.

1. Persist external_pending before sending. Success + failed finalization keeps
   that durable record and its held slot; return reconciliation_required. A
   checked separate write stores sanitized provider URIs if possible. An outage
   may prevent even that write; pending remains an operator reconciliation cue.
2. Timeout, malformed 2xx, 429 or 5xx after a write are ambiguous until verified.
   Do not release the slot or repeat POST. Read provider event/invitee information
   for the coach and expected client/time; do not log emails/tokens/payloads.
3. Definitive pre-send validation failure can release a held slot atomically
   with failed state. Provider rejection requires documented no-create semantics
   before release. Retry with a new reviewed operation only after no appointment
   is established. The UNIQUE booking/kind constraint needs an explicit audited
   attempt model before automated failed-operation retries are introduced.
4. Cancel under a booking lock and participant authorization. Requested/no-event
   cancellation can finalize locally. Confirmed cancellation first records a
   durable cancel operation, calls Calendly, then atomically marks booking/slots
   cancelled only on verified external cancellation. Ambiguity retains the slot.
   Refund policy and transaction state remain separate; never mark refunded from
   a scheduling response. Client RPC cannot impersonate a coach.
5. Rescheduling is a distinct authorized operation. Retain the old appointment
   and payment references until replacement is verified. Record old/new invitee
   links and new times, use the existing overlap guard, and reconcile provider
   events idempotently. Calendly sends both invitee.created and invitee.canceled
   for rescheduling; out-of-order delivery must not cancel the new booking.
6. Initially use a narrow authenticated reconciliation read via the existing
   Edge Function and an operator checklist. Add a signed webhook handler only
   after a test-app subscription, signature/replay checks, dedupe persistence
   and event-order tests. No new queue, service or project was created here.
*/

/*
PART F: grant/RLS deployment order -- NOT EXECUTABLE SQL.

Read definitions reviewed in catalog-evidence-2026-11-04.json:
create_marketplace_booking_request, coach_confirm_marketplace_booking,
cancel_marketplace_booking, create_marketplace_transaction,
admin_update_booking_status, admin_get_platform_analytics,
admin_get_platform_dashboard, admin_get_platform_operations,
marketplace_booking_notification_automation, process_due_marketplace_reminders,
schedule_marketplace_booking_reminders, send_marketplace_communication,
plus marketplace_schedule_reminders_on_booking and five public/account readers.
Payment-intent/status definitions were also inspected. This is a text-reference
inventory, not proof of absence of dynamic/indirect callers.

Replace invoker confirmation/cancellation writers and migrate ALL frontend,
admin, reminder, notification, communication and payment call sites first.
Fix privileged admin guards to require auth.uid() and role IS DISTINCT FROM
'admin' (NULL must deny). Keep SECURITY DEFINER only where justified, with a
fixed search_path, explicit identity/ownership checks, non-PUBLIC EXECUTE, and
reviewed owner privileges. Never globally convert invoker routines to definer.

Only AFTER rehearsed compatibility tests consider:

REVOKE ALL ON public.marketplace_booking_requests FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.marketplace_booking_requests FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.marketplace_booking_slots, public.marketplace_booking_events
  FROM anon, authenticated;

Audit and remove explicit COLUMN grants too: a table revoke alone is insufficient
when separate column grants remain. Preserve SELECT through existing participant
RLS and security_invoker views. Replace broad coach slot ALL management with
narrow availability operations. Audit events must be server-generated.

Review public readers for data minimization and intended anonymous browsing,
then consider GRANT EXECUTE on the three exact public-directory/profile RPCs
to anon; all three CURRENTLY deny anon. Do not publish token/connection tables.

Meeting details need a participant-scoped projection/RPC that redacts provider
management and join URLs before allowed confirmation/payment state. Merely
hiding the UI link is not an API authorization control.

Gate these changes on roles/column grants, RPC function owners/default grants,
RLS/advisor results, existing-booking/payment regression tests, two-session slot
races, request/confirm replay, provider timeouts, DB outages, cancellation and
reschedule webhook ordering. No revocation is safe until those gates pass.
*/
