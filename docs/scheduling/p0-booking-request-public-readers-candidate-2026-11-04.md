# P0 booking-request and public-reader correction — reviewed candidate (2026-11-04)

**Status:** SQL proposal ONLY. Do not execute in Production or seeded test project. Verify against a fresh authoritative schema export, function owner, grants, triggers, and isolated rehearsal before turning into a migration.

## Current deployed function evidence
`public.create_marketplace_booking_request(uuid,uuid,uuid,uuid,timestamptz,timestamptz,text,text)` is SECURITY DEFINER, checks `auth.uid()`, verifies the client, offering, coach, duration, and slot overlap, inserts a booking, then attempts:

```sql
insert into public.marketplace_booking_events
  (booking_id,event_type,actor_profile_id,metadata)
values (v_booking.id,'booking_requested',auth.uid(),jsonb_build_object('source','coach_profile'));
```

The audited event table instead requires `actor_type`, `actor_id`, `event_data` and permits `event_type='requested'`. The second INSERT aborts the entire function transaction. Do not simply delete event logging: notifications and reminders may depend on the event.

## Candidate event insertion replacement (fragment, NOT a migration)

```sql
INSERT INTO public.marketplace_booking_events
  (booking_id, event_type, actor_type, actor_id, event_data)
VALUES
  (v_booking.id, 'requested', 'client', auth.uid(),
   jsonb_build_object('source', 'coach_profile'));
```

**Must verify:** `actor_type` CHECK accepts `client`, `actor_id` is the authenticated profile ID (not `clients.id`), event table defaults and other NOT NULL columns, and whether a trigger already emits the same event. Confirm exactly one event and no duplicate notifications. Preserve existing RPC signature, security semantics, and return payload. Add regression tests for invalid client, inactive offering/coach, duration mismatch, and overlapping held/booked slots. Never accept caller-supplied actor or booking status.

## Public RPC access — exact candidate grants (fragments)

```sql
GRANT EXECUTE ON FUNCTION public.get_public_coach_directory() TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_service_directory() TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_coach_profile(uuid) TO anon;
```

These are SECURITY DEFINER functions; their existing projections include coach names, bios, profile avatar, pricing, service metadata and, for profiles, credentials, professional links, and availability. Review those fields for intentional publication and check the function owner and `search_path` before granting. Keep `calendly_connections`, booking rows, provider secrets, private meeting links, and payment details inaccessible. Do **not** grant direct table writes or broad `public` schema privileges.

## Isolated acceptance matrix

- As `anon`: directory and public verified profile succeed; private/unverified coach and private booking details remain inaccessible.
- As client A: booking request succeeds with a single `requested` event, matching owner, duration and offering; client B cannot forge client A's identity or link an unrelated service request.
- Inactive/unapproved coach, unavailable offering, invalid times and overlap fail without partial booking or event rows.
- Existing notifications and reminders emit once and preserve legacy semantics.
- Role/column privileges, function owners, SECURITY DEFINER search paths, default EXECUTE grants and RLS are checked.
- Repeat request/concurrent request tests demonstrate limitations; global idempotency remains a separate P0 gate.

## Deployment gates

No runnable migration is provided. Obtain authoritative schema-only baseline, create disposable isolated database, rehearse all dependencies and rollback, then prepare migration with correct CLI workflow. Backend confirmation, payments, cancellation and rescheduling remain blocked independently. No Production writes, seeded project writes, live Calendly actions or Paystack transactions.
