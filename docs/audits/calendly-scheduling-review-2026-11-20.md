# CareerDev Global Calendly scheduling review

Review date: 2026-11-20. Repository: `tolulopemakinde/careerdevglobal`. Production project inspected read-only: `ufmhrmzumqkjvaezrmxf`.

**Scope:** source review, Supabase catalog reads, deployed Edge Function source review, and official Calendly documentation review. No Production writes, OAuth changes, appointments, cancellations, payment transactions, or schema changes were made. No seeded test project was accessed or changed for this review.

## Executive result

The existing marketplace workflow is present, but end-to-end scheduling is not verified. Client-facing slots are generated from recurring CareerDev coach availability; Calendly's live availability API is not called. The first Calendly availability check occurs when the coach confirms. The OAuth flow currently requests `users:read event_types:read scheduled_events:write`; current Calendly documentation requires `availability:read` for `GET /event_type_available_times`, so live availability cannot be added until the coach reauthorizes with that scope.

The coach's confirmation path calls Calendly before the local slot-claim RPC. A provider appointment can therefore be created before the local database rejects a race or fails to confirm. The Edge Function checks whether it saved the event URI and returns a reconciliation-required error on a save failure, but a successful save followed by a failed local confirmation still leaves an external event attached to a requested booking. Retrying can create another event because this flow has no provider-operation idempotency record.

The client dashboard's cancellation action is not safe to present as a completed cancellation: Production `cancel_marketplace_booking` runs as invoker, the booking-request update policy is coach-only, and the function returns `true` without checking whether the update affected a row. The dashboard also has no rescheduling action. These require database and server work; this branch routes client change requests to Support instead of claiming they were completed.

## Workflow verification

| # | Workflow step | Status | Evidence and limits |
|---|---|---|---|
| 1 | Browse coaches | Implemented; live result not exercised | `app/book-coaching/page.tsx` calls `get_public_coach_directory`; its contents and live data were not tested with a client session. |
| 2 | Select a coaching service | Implemented; live result not exercised | Coach profile loads `get_public_coach_profile`; offerings retain their `service_id` and offering ID. `get_public_calendly_booking_links` supplies a separately labeled direct link. |
| 3 | Select date and time | Partially implemented | `app/coach-profile/[coachId]/page.tsx` generates slots from coach-entered recurring availability and excludes known held/booked slots. It does not call Calendly's live availability endpoint. Slot times were labeled with the coach timezone before this branch. |
| 4 | Submit a booking request | Implemented; concurrency unverified | The page calls `create_marketplace_booking_request`. The SECURITY DEFINER RPC verifies the signed-in client, offering ownership, coach status, duration, and overlap with already held/booked slots. It does not reserve the requested slot or accept an idempotency key; concurrent pending requests can overlap. |
| 5 | Coach receives and reviews the request | Partially implemented | The Coach Dashboard reads `coach_marketplace_upcoming_bookings` and offers Confirm/Decline actions. Automated email or push delivery was not verified. |
| 6 | Coach confirms | Partially implemented | `app/coach-dashboard/page.tsx` calls `careerdev-calendly-booking` (`book`) and then `coach_confirm_marketplace_booking`. The latter locks the booking row and claims a slot under the existing no-overlap exclusion constraint. A disconnected/unmapped Calendly service currently allows marketplace-only confirmation. |
| 7 | Calendly creates the event | Conditional; not live verified | Deployed `careerdev-calendly-booking` v14 calls `POST /invitees` with the mapped event type and requested UTC start time. It requires a coach connection, service mapping, suitable live slot, and `scheduled_events:write`. No real call was made. |
| 8 | CareerDev records the appointment | Partially implemented | The Edge Function saves event/invitee URIs and meeting details and checks the update error/affected row. The subsequent coach-confirm RPC is a separate transaction and may fail after the external event exists. |
| 9 | Client receives booking details | Implemented in dashboard; delivery not verified | The `security_invoker=true` `client_marketplace_upcoming_bookings` view exposes participant rows and meeting fields through RLS. The client dashboard displays status, time, payment state, and a meeting link only for confirmed bookings. Email delivery was not verified. |
| 10 | Client completes payment | Implemented; no payment tested | The dashboard calls `careerdev-marketplace-payments` only for a confirmed booking with a pending/authorized payment state; deployed function v17 uses a payment intent and Paystack. Production payment behavior was not exercised. |
| 11 | View, cancel, or reschedule | View: implemented. Coach cancel: conditional. Client cancel: blocked. Reschedule: not implemented. | Coach cancellation calls Calendly before `cancel_marketplace_booking`, so provider success/local failure can diverge. The client cancellation RPC can return success despite an RLS-filtered zero-row update. Current Calendly docs say there is no API reschedule operation; invitee `reschedule_url` is the supported handoff. |

## Production evidence checked

- Edge Functions: `careerdev-calendly-booking` v14 (`verify_jwt=true`), `careerdev-calendly-oauth` v13 (`verify_jwt=false`, public callback with state/PKCE checks), and `careerdev-marketplace-payments` v17 (`verify_jwt=true`) are active. Function source was read, not invoked.
- Current OAuth authorization code requests `users:read event_types:read scheduled_events:write`. Tokens are encrypted at rest in `calendly_connections`; client roles have no table privileges there. Token values were not read.
- `marketplace_booking_slots` has a GiST exclusion constraint preventing overlap for `held`/`booked` rows. It only protects claimed rows, not overlapping requests that have not yet been confirmed.
- `marketplace_booking_requests`, `marketplace_booking_slots`, and `marketplace_booking_events` have broad table-level grants to `anon` and `authenticated`; RLS remains enabled. Request RLS restricts reads to participants and allows coach updates by row ownership, but does not restrict mutable columns. Treat the direct-write surface as a hardening priority. No grant was changed.
- The request cancellation function is SECURITY INVOKER with default/PUBLIC execute in its ACL. Its body checks the caller, but its update is subject to RLS and it does not validate row count. The dependent routine inventory must be reviewed before changing any grants or policies.
- The client and coach upcoming-booking views use `security_invoker=true`; meeting links are selected from the booking table and protected by participant RLS. Do not loosen access to these views or table fields.
- The existing security branch contains an October 2026 migration-history recovery report. It found the authoritative historical SQL chain was not recovered. The current `main` checkout has only five SQL files under `supabase/migrations`, while Production reports a much larger ledger. This work therefore adds a proposal outside `supabase/migrations` and does not invent or execute a historical migration.

## Prioritized defect list

1. **P0 — External event can outlive the local confirmation.** `POST /invitees` precedes the atomic slot claim and final state change. A local failure after provider success can leave an untracked or duplicate event.
2. **P0 — Protected booking metadata is mutable through broad grants.** Coach row ownership policy does not protect `booking_status`, Calendly URIs, meeting fields, payment-sensitive fields, or client metadata at column level. RLS is enabled, but grants and row policies still permit a broad coach update surface.
3. **P1 — Client cancellation can falsely report success.** The client calls an invoker RPC that is blocked from updating the booking row by the current coach-only UPDATE policy; the RPC does not check row count. A client cannot safely cancel through this path.
4. **P1 — Displayed availability is not Calendly availability.** The page synthesizes candidate slots from recurring CareerDev availability and reads only locally booked slots. The current OAuth grant lacks Calendly `availability:read`.
5. **P1 — Pending requests are not atomic slot claims.** The exclusion constraint applies to `held`/`booked` slots; a request does not create a hold. Multiple clients can request the same slot and only learn of contention during coach confirmation.
6. **P1 — Provider retry/idempotency and reconciliation are incomplete.** There is no durable operation key/state for confirm or cancel. Do not retry a timeout after a possible Calendly success without reconciliation evidence.
7. **P1 — Rescheduling is absent.** Calendly's API currently has no reschedule endpoint. The client must follow its invitee reschedule URL; the result then needs to reconcile to the original booking and payment record.
8. **P2 — Cancellation/status feedback is unclear.** Client dashboard conflates local cancellation with provider cancellation and has no explicit reschedule support path. Meeting details may be absent after a marketplace-only confirmation.

## Minimal-change architecture

1. Keep the coach directory, service/offering mapping, client and coach dashboards, marketplace payment records, coach approval workflow, and direct link fallback.
2. Keep Calendly OAuth token handling server-side. Add an authenticated Edge action that checks client authorization, active offering, coach ownership, mapped event type, and Calendly connection before requesting availability. Use Calendly `GET /event_type_available_times` for the selected event type and a bounded date window; request only the needed dates and pass UTC instants to the browser.
3. Request `availability:read` in a future OAuth authorization flow. Keep current scopes needed for event type lookup and `POST /invitees`. Add `scheduled_events:read` only if API-based reconciliation/listing is selected. Do not change Production OAuth settings in this task.
4. Use a narrow server-side confirmation operation: transactionally validate participant/coach, requested state, mapping, and slot; claim an operation/idempotency key; then call Calendly. Persist the provider identifiers and final state with checked row count. If the provider outcome is uncertain, keep the operation locked as reconciliation-required and never blindly re-POST.
5. Keep the existing direct Calendly link as an explicitly labeled external booking option. Continue to state that it creates no CareerDev booking or payment record.
6. For cancellation, authorize either assigned coach or booking client on the server, call Calendly, then persist local cancellation. On uncertain provider response, leave the booking in a reconciliation state. For reschedule, use the provider's invitee `reschedule_url`, then reconcile `invitee.canceled`/`invitee.created` webhooks or a protected scheduled-event lookup before updating the same marketplace booking. Preserve payment/transaction IDs and do not create a second paid booking.

## Security and SQL proposal

`supabase/proposals/marketplace_booking_provider_operations.sql` proposes a service-only operation ledger. It is not a migration and has not been applied. It provides a durable idempotency key and a single in-flight operation constraint, but it does not alone solve Calendly's external idempotency or state-transition requirements.

Before any actual migration, add reviewed RPCs for create/confirm/cancel and allowed note edits. Verify every direct writer and dependent routine, including `create_marketplace_booking_request`, `coach_confirm_marketplace_booking`, `cancel_marketplace_booking`, `admin_update_booking_status`, transaction/payment functions, notification routines, triggers, Edge Functions, and jobs. Then replace broad direct updates with narrow operations and narrow grants. Do not revoke grants until each caller is migrated and tested. Keep `calendly_connections` and OAuth state service-only; expose meeting details only through participant-authorized reads.

The client cancellation action on this branch now directs the user to the existing Support form rather than calling the unverified cancellation RPC. This is a temporary truthful path, not a completed self-service cancellation implementation.

## Nonproduction implementation and validation

- Implemented a shared timezone formatter for the coach profile and Client/Coach booking views. Slot options show the client's local time and coach's schedule time; the selected calendar day and date-input minimum use the coach profile timezone.
- Added an in-flight ref guard around client booking submission, in addition to the disabled button, to reduce rapid duplicate submissions. Server idempotency is still required for retries, multiple tabs, and concurrent requests.
- Client booking cards now explain pending coach review, post-confirmation payment, and missing meeting details; confirmed meeting links remain displayed only for confirmed bookings. The unsupported client cancellation action now routes to Support.
- Coach confirmation now explicitly asks before continuing with a marketplace-only confirmation when Calendly is disconnected or the service is unmapped. The page distinguishes a successful Calendly confirmation from a marketplace-only confirmation.
- Pinned Next.js was updated from `16.4.0` to the security release `16.4.5` after the first production build was stopped by Next.js's security guard. The full build passed after the update. See the [Next.js 16.4.5 release](https://github.com/vercel/next.js/releases/tag/v16.4.5).
- Added synthetic unit tests in `scripts/test-marketplace-booking-time.mjs`. These cover timezone conversion, cross-date display, timezone-specific date minimums, and invalid timezone/time data. They do not make Supabase or Calendly requests.
- Browser/mobile workflow checks, authenticated client/coach tests, API mocks for Calendly confirmation/cancellation, payment integration tests, RLS tests, and end-to-end tests remain outstanding. No Production appointments or payment transactions were created.

## Remaining blockers and rehearsal requirements

- Obtain a fresh, complete authoritative baseline/migration chain. Do not edit the existing Production migration ledger or reconstruct historical files.
- Establish an isolated nonproduction Supabase project/branch with explicit cost approval, Production-aligned PostgreSQL/extensions, and synthetic coach/client data. Do not use the seeded `careerdevglobal-ai-test` project.
- Reauthorize only designated synthetic coaches with the verified minimum scopes; do not alter Production credentials/settings for rehearsal.
- Implement and test narrow RPCs, atomic operation claim, retry rules, failure injection, client/coach cancellation, and payment-state invariants before changing direct-write grants.
- Test Calendly unavailable/stale slots, provider timeouts before and after create, response persistence failures, duplicate confirmation, cancellation mismatch, reschedule webhook mapping, and authorization of meeting links.
- Run responsive browser checks at mobile and desktop widths and confirm no dashboard or coach-approval regressions.

## Production readiness checklist

- [ ] Verified live availability API with `availability:read` on a synthetic coach.
- [ ] Atomic server claim and tested idempotent/reconciliation path in isolation.
- [ ] Direct booking metadata writes removed only after all dependent writers pass.
- [ ] Client and coach authorization tests pass, including private meeting URLs.
- [ ] Cancellation and reschedule reconciliation preserves booking and payment identity.
- [ ] Payment-state regression tests pass without real transactions.
- [ ] Mobile/keyboard workflow checks and existing dashboard regression suite pass.
- [ ] Isolated schema rehearsal and rollback review pass.
- [ ] Draft PR checks pass and receive code/security review.
- [ ] Separate owner approval for any Production migration, OAuth change, merge, or deployment.

## Official Calendly documentation reviewed

- [Authorization Scopes](https://developer.calendly.com/docs/authentication/scopes)
- [List Event Type Available Times](https://developer.calendly.com/api-docs/calendly-api/event-types/list-event-type-available-times)
- [Create Event Invitee](https://developer.calendly.com/api-docs/calendly-api/scheduled-events/create-event-invitee)
- [Cancel Event](https://developer.calendly.com/api-docs/calendly-api/scheduled-events/create-scheduled-event-cancellation)
- [Calendly API FAQ: cancellation and rescheduling](https://developer.calendly.com/docs/getting-started/frequently-asked-questions)
- [Calendly 2026-11-03 release notes: Scheduling API on Free plan](https://developer.calendly.com/release-notes/2026/11/3)
