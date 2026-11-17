# Calendly backend rehearsal

> Current implementation and setup evidence: [17 November route readiness](../acceptance-setup-and-route-readiness-2026-11-17.md). The guarded OAuth and durable operation adapters now exist; live acceptance remains pending an isolated public backend and owner designation. Historical unbound-route statements below describe the earlier candidate stage.

> Configuration review (17 November 2026): [owner settings, scope/plan rules, test evidence and blockers](../acceptance-config-review-2026-11-17.md). The four supplied settings are placeholders; keep live acceptance pending. Current Calendly rules make scheduled-event write include read and permit Free-plan booking/webhooks subject to limits. Do not infer a designated host, granted scopes or a matching callback from these rules.

These candidates are executable against an empty Postgres fixture. The files
live outside the migration directory. The legacy app and Edge Function do not
call the candidate operation module. The backend draft and its build-only
Vercel preview are for review.

## Rehearse

Run the existing scheduling suite with Node 22. The GitHub Actions database job
starts Postgres 16 with the synthetic database name required by
tests/calendly-rehearsal.sh. It runs the corrected booking-request RPC and
checks separate-session claim and transaction races, role grants, slot
exclusion, provider identifier guards, cancellation, and reschedule rollback
on overlap and replay. The reduced fixture omits the deployed notification and billing
triggers and cannot establish migration compatibility.

The local Supabase CI job uses a fresh CLI stack with no hosted project. It
signs in two synthetic users, invokes the reschedule handler with their actual
Supabase access tokens, and verifies the moved slot and retained marketplace
transaction through PostgREST. Its Calendly responses are synthetic. Browser
acceptance and the hosted Calendly Sandbox flow are separate checks.

The reschedule Edge candidate requires the exact disposable Supabase project
ref in CALENDLY_RESCHEDULE_REHEARSAL_PROJECT_REF and the browser origin in
CALENDLY_RESCHEDULE_REHEARSAL_ORIGIN. It rejects both existing project refs.
Use a dedicated token encryption key and a fresh synthetic Calendly sandbox
connection with scheduled event read scope. The function accepts a POST with
the booking_id and a verified client JWT. Its Calendly requests are GET only.
It returns the current invitee's hosted URL or applies a verified replacement
under the booking lock. It clears stale meeting details and keeps the existing
marketplace transaction. Use synthetic accounts and avoid real appointments.
Set NEXT_PUBLIC_CALENDLY_RESCHEDULE_REHEARSAL_PROJECT_REF to the same project ref
in the preview build to show the client controls. The client opens Calendly in
a new tab, then checks for the new time from their dashboard.

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
- Verify the provider-hosted flow and immediate old/new invitee linkage from
  the client dashboard in the sandbox.
  Add authenticated webhook or scheduled reconciliation for out-of-order
  notifications, multiple moves before a refresh, and overlap conflicts.
  Rehearse replacement meeting details and reminders on the full schema.
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
