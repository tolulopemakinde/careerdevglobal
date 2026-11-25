# Calendly marketplace booking hardening — review gate

Status: **proposal only — no production migration or deployment authorized by this document**.

## Verified production baseline (2026-10-28)
- One active Calendly OAuth connection, with users:read, event_types:read, scheduled_events:write; encrypted access/refresh token columns. No token values were retrieved.
- Zero offerings mapped to Calendly event types; two direct booking URLs; zero marketplace booking requests at inspection.
- `marketplace_booking_requests`: RLS enabled, but `anon` and `authenticated` have table-wide UPDATE and DELETE privileges. `authenticated` can UPDATE every column, including ownership, status and Calendly metadata.
- Coach RLS UPDATE policy checks row ownership, not mutable fields.
- `coach_confirm_marketplace_booking` and `cancel_marketplace_booking` are SECURITY INVOKER functions; revoking table UPDATE without refactoring breaks these RPCs.
- Coach Dashboard invokes Calendly `book` before the DB confirmation RPC. The Edge Function calls POST /invitees, then updates `marketplace_booking_requests` without checking update error or affected row count.
- Calendly cancellation is attempted before the local cancellation RPC; partial success can diverge.
- OAuth function v11, booking function v10, production frontend from commit 0298ea5ce32463fe0ddd3fbe3db22cee7ffb48d3.

## P0: database authorization design (requires review)
1. Inventory all writers to `marketplace_booking_requests` (frontend, RPCs, triggers, Edge Functions, jobs) and all grants/policies on related booking slots/events. Confirm column-level and default grants.
2. Replace direct client writes with narrow, ownership-checked RPCs for booking request, confirmation, cancellation, and permitted note edits. Use a carefully audited SECURITY DEFINER implementation only where needed, with a fixed search_path, explicit `auth.uid()` checks, state-transition checks, and narrow EXECUTE grants. Prefer invoker rights where possible.
3. After all call sites are migrated, revoke unnecessary `anon` table privileges and unrestricted `authenticated` UPDATE/DELETE; preserve only minimum read/write permissions required by RLS-backed flows.
4. Ensure booking status, client_id, coach_id, Calendly event/invitee URIs, and payment-sensitive fields cannot be directly mutated by clients/coaches. Review the booking state machine and idempotency constraints.
5. Inspect existing policies and grants on `calendly_connections`, `calendly_oauth_states`, `marketplace_booking_slots`, `marketplace_booking_events` and payment-related tables. Never expose token ciphertext through a public RPC.

## P1: scheduling consistency design
- Current order is external POST /invitees -> local confirmation RPC. An external appointment may survive a local reservation failure.
- Introduce an explicit state machine: requested -> confirming -> confirmed, with failed/reconciliation-required paths. Atomically claim/reserve the slot and authorize the booking *before* external API calls; use a unique operation key and DB uniqueness guards to prevent concurrent or retried duplicate appointments.
- Persist external event/invitee URIs and API result with checked DB errors. A failed persistence operation must not return success. Build a reconciliation job for ambiguous external outcomes (timeout after Calendly success).
- Verify Calendly API's actual idempotency and booking/cancellation semantics before implementation; do not assume provider-side idempotency.
- For cancellation, record a pending state and reconcile both sides; don't report completed cancellation until outcomes are verified.
- Preserve the manual external booking-link fallback as a separate, clearly disclosed path without marketplace payment/booking claims.

## Acceptance tests — must pass before merge
- Anonymous and unrelated users cannot read or mutate private booking data.
- Coach A cannot change Coach B's bookings or Calendly connection.
- Client/coach cannot directly update status, ownership, event URI or other protected fields.
- Authorized booking request, confirm, decline, cancel and notes operations still work.
- Double-click, concurrent confirm, retry, timeout, and slot collision never create duplicate confirmed appointments.
- External booking success followed by DB failure is recorded for reconciliation; no false success.
- Failed Calendly cancellation does not falsely mark both systems cancelled.
- Token expiry/refresh and event-type mapping work for a designated test coach; no secrets in logs.
- Migration is rehearsed on a nonproduction database seeded with representative sanitized records. Validate rollback and RLS/advisor results.

## Rollback / release gates
- Back up schema, grants, policies, function definitions, and deployment references before rollout.
- Prepare a forward-fix and rollback SQL plan. A rollback must not reopen broad privileges without explicit risk acceptance.
- Review SQL diff, RPC privilege model, Edge Function source, CI tests and Vercel preview before requesting owner approval.
- No production DDL, secrets changes, real booking, merge, or deployment until explicitly approved.

## Open blockers
- Authoritative complete migration history/source-of-truth is incomplete.
- Need complete inventory of application write paths, current grants, and all booking/marketplace dependencies.
- Need a nonproduction test environment and designated test accounts for end-to-end verification.
