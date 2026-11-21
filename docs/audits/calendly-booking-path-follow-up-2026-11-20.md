# Calendly booking path follow-up — 20 November 2026

## Scope and safety

This review uses the current `main` source and public repository history. It
does not access Supabase project data, change Production or the seeded test
project, alter OAuth or Calendly settings, create appointments, or initiate
payments. Tests use synthetic data only.

The previous local-only commit `cce72aa` is not present in the cloned Git
history or accessible on GitHub. The five files named in the handoff were also
absent from the pushed development branch. The current main branch is
`8deb8410b4ef07fcc32d6b02c1ec7f7d83aac453`; the existing
`codex/calendly-scheduling-improvement-2026-11` branch is at
`9865a8bd78539c89564ba34c984a58aa9e005655`, whose base predates current main.

## Workflow assessment

| Step | Status on current `main` | Evidence and limitation |
| --- | --- | --- |
| Client selects a coach/service and submits a request | Partial | Existing marketplace UI and request RPC are present in the wider repository, but the authoritative RPC DDL is not in current main's small migration set. |
| Client sees times | Partial | The dashboard documents coach-entered availability; no live Calendly availability query is made before displaying times. Stale or conflicting availability remains possible. |
| Calendly checks availability | Blocked | The currently documented OAuth grant lacks `availability:read`. Do not edit OAuth settings here. Owner-controlled reauthorization with the required scope is a blocker. |
| Coach confirms | Partial | Current code calls the Calendly booking function and then the booking confirmation RPC. Existing audits report provider/local partial-failure and duplicate/concurrency risks. |
| Client pays | Partial | A client dashboard payment action and payment-status RPC exist. This review does not claim transaction initialization, settlement, refund, or chargeback end-to-end acceptance. |
| Client sees meeting details | Display safeguard improved; server enforcement unverified | Client UI now requires booking status `confirmed` plus payment status `paid`, `captured`, or `settled` before rendering meeting details. The current database view may still return those details to the client API before payment. This UI condition is not security authorization. |
| Cancellation/rescheduling reconciliation | Blocked on current main | Current main does not contain a rehearsed full lifecycle implementation. A separate draft PR (#48) has broader acceptance work, but is not integrated into this branch or based on current main. |
| Direct Calendly fallback | Partial | Existing direct-link fallback is separate from marketplace booking/payment. It must remain clearly labeled and must not imply a marketplace booking or payment record. |

## Database security review

The current main checkout contains only a small subset of Supabase migrations.
It does not provide the exact definitions for `client_marketplace_upcoming_bookings`,
the payment-status function/view, or their full dependency graph. Therefore this
change does not replace a database view, alter grants, or change RLS policies.
The SQL proposal file is comments only and intentionally contains no executable
DDL.

Before proposing executable SQL, review the authoritative definitions of every
dependent view and RPC, table ownership, view security options, grants and
default privileges, all relevant RLS policies, and frontend/Edge/RPC writers.
The database must enforce client ownership and settled-payment/confirmed-booking
conditions independently of the browser. Coaches and administrators need
separately verified access paths. Rehearse refund, dispute, replay, dependency
recreation and restore behavior locally first.

## Synthetic test coverage

The new current-branch test covers the display policy for confirmed/paid,
unconfirmed, pending, unknown, refunded, disputed and missing payment states.
It does not prove database confidentiality or payment settlement.

The requested duplicate-request, duplicate-confirmation, concurrent-slot,
Calendly rejection/timeout/uncertain-result, database-failure-after-provider-
success, retry/idempotency and cancellation/rescheduling cases remain unverified
by tests on this branch. Related synthetic tests exist on the separate draft
backend-remediation branch/PR #48, but those tests were not run as part of this
current-main-based change and do not establish production acceptance. Do not
describe the workflow as end-to-end verified.

## Local rehearsal and remaining blockers

Docker and the Supabase CLI are unavailable in this environment. Current main
also lacks the historical schema migrations needed to reconstruct the complete
database, so no local Supabase rehearsal is available from this checkout. No
migrations were fabricated.

Remaining blockers include authoritative database view/RPC/grant/RLS review,
server-side withholding of unpaid meeting details, Calendly `availability:read`
and owner-controlled reauthorization, provider/local booking reconciliation,
duplicate/concurrent request handling, payment and refund consistency, and
cancellation/rescheduling recovery. No Supabase, Vercel or paid resource was
created or changed.
