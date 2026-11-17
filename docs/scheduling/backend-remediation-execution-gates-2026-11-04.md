# Calendly backend remediation execution gate — 2026-11-04

**Status:** Preparation only; no executable migration or deployment authorization.
**Parent:** Draft PR #44, commit e91f995093e5544b176a45f9f6b8c8d15ea51250.
**Production:** ufmhrmzumqkjvaezrmxf — read-only.
**Seeded test project:** yyevuwvtrktrzwuzeddo — do not modify.

## Verified starting point
- GitHub Actions Phase 1 validation run 41842494239 succeeded, including npm ci, TypeScript, 33 scheduling tests, static security checks, and full Next.js build.
- `docs/scheduling/review-2026-11-04.md` contains source/catalog findings; `docs/scheduling/database-proposal.sql` is intentionally comment-only, not a migration.
- The authoritative production schema-only SQL baseline has not been acquired or rehearsed. Do not use `supabase db push`, reset, or migration repair against Production.

## Work order and acceptance tests

### Gate A — request creation and public browsing (P0)
1. Reconcile `create_marketplace_booking_request` against live catalog for `marketplace_booking_events`. Existing function references nonexistent `actor_profile_id`, `metadata`, and invalid `booking_requested` event value. Preserve the function signature, required columns `actor_type`, `actor_id`, `event_data`, allowed event type `requested`, and existing triggers.
2. Review exact result projections and EXECUTE grants for `get_public_coach_directory`, `get_public_service_directory`, `get_public_coach_profile`. Allow only intended public reads; no direct token, private appointment, or participant data.
3. Rehearse anonymous list/profile reads, unauthorized private reads, authenticated request creation, malformed inputs, and resulting event/notification records in a disposable isolated database.
**Do not apply proposed SQL to Production.**

### Gate B — atomic confirmation and idempotency (P0)
1. Introduce a private durable operation record keyed to booking/action and immutable request parameters, with explicit claim, external_pending, succeeded, and reconciliation_required semantics.
2. Claim the requested slot transactionally *before* calling Calendly. Only the caller winning the single-use transition may POST an invitee. Preserve the GiST overlap exclusion constraint.
3. Finalize provider identifiers, slot, booking, and audit event atomically; if provider outcome is uncertain, retain the claim and require reconciliation. Never blindly retry a possibly successful POST.
4. Verify assigned-coach authorization, approved-coach status, event-type ownership, duration, location requirements, available slot, and user identity server-side.
5. Exercise two-client/two-coach concurrency, duplicate requests, network timeouts, malformed provider responses, DB failure after external success, and safe reconciliation.

### Gate C — payments and cancellations (P1)
1. Trace `create_marketplace_transaction` and `create_marketplace_payment_intent`. Introduce idempotent transaction initialization for a confirmed booking, without changing existing Paystack ledger, prices, or refund policies.
2. Add participant-authorized, checked cancellation and rescheduling operations; preserve provider IDs and financial state. No automatic refund from a Calendly cancellation.
3. Test local/provider partial failures, out-of-order event notifications, repeat cancellations, payment retries, and pre-existing booking/payment regression.

### Gate D — authorization and deployment safety
1. Enumerate every direct and indirect consumer of booking/slot/event tables and relevant RPCs (admin, notifications, reminders, payments, dashboards).
2. Replace broad client table writes with narrow server operations *before* revoking table or column privileges. Verify RLS, invoker/definer boundaries, `auth.uid()`, admin role NULL denial, and public projection.
3. Produce an executable, reviewed migration only after acquiring a verified schema-only baseline and disposable rehearsal. Do not reconstruct missing historical migration sources or modify Production migration history.
4. Require CI, database role tests, concurrency tests, authenticated client/coach browser QA, provider sandbox confirmation, and payment sandbox validation before requesting merge/deploy.

## Explicit stop conditions
- No disposable isolated database or no authoritative schema baseline.
- No authenticated Calendly sandbox/permission evidence for API actions.
- Unknown side effects on existing payment, notification, admin, or reminder paths.
- Any unexpected data exposure or irreversible action.

Report verified outcomes and blockers, keeping Draft PR #44 unmerged. A separate backend PR should remain draft until all relevant gates pass.
