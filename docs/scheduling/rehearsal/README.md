# Calendly backend rehearsal

These candidates are executable against an empty Postgres fixture. The files
live outside the migration directory. The legacy app and Edge Function do not
call the candidate operation module. The backend draft and its build-only
Vercel preview are for review.

## Rehearse

Run the existing scheduling suite with Node 22. The GitHub Actions database job
starts Postgres 16 with the synthetic database name required by
tests/calendly-rehearsal.sh. It runs the corrected booking-request RPC and
checks separate-session claim and transaction races, role grants, slot
exclusion, provider identifier guards, cancellation, and persisted audit
events. The reduced fixture omits the deployed notification and billing
triggers and cannot establish migration compatibility.

## Release gates

- Obtain a schema-only Production baseline with authoritative constraints,
  grants, triggers, extension versions and function bodies. Rehearse forward
  migrations and rollback in a disposable Supabase project with synthetic
  data. Production and the seeded billing test project are excluded.
- Bind the authenticated Edge handler to the service-only RPCs. Derive the
  actor from the verified JWT, and verify booking participation before exposing
  context. The first permitted confirmation is a single-host, coach-owned,
  instant, unpaid Calendly event with one supported location and no required
  custom answers. Check existing mapped offerings against that contract.
- Route managed booking actions through the new handler before retiring the
  legacy provider and database mutation paths. Replace authenticated direct
  writes to requests, slots, and audit events with specific operations and
  test legacy non-Calendly and admin flows. Ensure payments and admin status
  mutations observe pending scheduling operations and fix the admin RPC's
  NULL-role authorization check.
- Verify Calendly sandbox scopes for user, event types, availability, scheduled
  event reads and scheduled event writes. Test provider idempotency behavior
  using the durable claim. A timeout, malformed response or storage failure
  leaves the hold in place. Where no provider receipt exists, retrieve candidate
  identifiers through authorized provider reads and match the operation's
  tracking value, owner, event type, time and linked invitee before completing.
- Calendly rescheduling is a provider-hosted workflow. Add participant-only
  delivery of the provider's reschedule URL and reconcile verified old/new
  invitee linkage under the booking lock, including out-of-order notifications
  and overlap conflicts. The candidate rejects rescheduled evidence in confirm
  and cancel paths.
- Rehearse payment intents, retries, refunds and subscription/entitlement
  regressions in Paystack test mode. The transaction initializer is a client
  RPC with a booking lock and unique booking key. It writes the existing
  transaction and event only. Verify all downstream consumers before using it.
- Verify the anonymous coach and service projection against real view owners,
  underlying privileges and RLS, including private and unapproved coaches.
  Run authenticated browser acceptance for the client and coach, including
  participant isolation and the correct preview database target.

## Rollback rehearsal

1. Capture and compare the exact definitions, owners, grants and policies for
   each touched object before rehearsal. Record the previous Edge bundles and
   Vercel deployment ID with the target environment and commit.
2. Disable new scheduling writes first. Preserve pending operations and holds.
   Reconcile each unresolved operation with provider reads before restoring any
   legacy route that can create, cancel or change an appointment.
3. Restore prior app routing and database definitions and grants from the
   captured, environment-specific backups after resolving pending work. Keep
   operation and transaction audit records and provider identifiers. Do not
   replay the original external action or reverse payments during rollback.
4. Rehearse authorization, booking state, notification and payment behavior
   after restore, including a provider success followed by a database failure.
