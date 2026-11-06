# Approved matched TEST payment — preparation and control review

Owner explicitly approved the conditional plan on4November: one Fresher monthly Paystack TEST payment ofNGN7,500 (750000 minor units),25 credits, then one renewal stop. No refund, replacement payment, LIVE action or production release is approved. Checkout is not initialized in this preparation snapshot.

## Scope and isolation

The global billing flag remainsfalse, as does the refund-policy flag. Existing21 accounts are not declared disposable. The runner creates exactly one new client with server-owned app_metadata synthetic/billing-acceptance markers and the recorded approval reference, verifies its identity and empty subscriptions/credits/operations, and never selects a caller-supplied account. All prior records and payment attributions are preserved.

A private service-only authorization table is empty/default-off. Its approval reference is UNIQUE, so the same approval cannot authorize a second account even through an operator mistake. Customer/anon roles have no read/insert/update grants, RLS is enabled, and actual customer-role denial plus fixed amount/lifetime constraints pass5 SQL assertions, both in rollback rehearsal and after TEST-only application. Source migration 20261104141257 is recorded as TEST history 20261104145537. The one-account constraint is recorded as TEST history 20261104150334, from source migration 20261104150331. No production migration or global gate activation.

The original authenticated checkout/manage Edge entrypoints now consult one shared release policy. Existing global-release behavior is preserved. When that flag isfalse, a TEST scope can apply only if all conditions hold: exact yyevuwvtrktrzwuzeddo server URL, sk_test_ credentials, exact private approved user/approval reference, enabled/nonexpired/max24-hour row, Fresher monthly/NGN7500/25-credit budget and unchanged active catalog price. Other users, projects, LIVE mode, upgrades, altered budgets, storage errors and expired/malformed scopes fail closed. Only the verified auth.getUser identity is used; request JSON cannot impersonate another user.

The scope admits no more than one checkout operation. Only the same pending operation can recover its existing URL; confirmed payment permanently consumes checkout eligibility even after expiry. Cancellation requires the exact owned receipt, amount/currency and subscription, and allows only one pending cancellation operation. Normal per-user locks, provider-call claims, checkout ownership, provider plan checks and callback validation remain unchanged.

The test runner is also JWT-protected and requires a private high-entropy expiring operator capability, whose digest alone is in source. Its raw value is in an ignored local credential file and is never logged, returned or committed. Public anon bearer alone is insufficient (deployed401 confirmed). It supports only fixed initialize/observe/cancel actions, uses one durable run claim, never accepts a caller-selected budget/reference/account, and never initializes again after uncertainty. It rejects near-expiry operator windows. Account approval expires no later than the operator deadline and at most23 hours from activation.

Only after exact-source CI succeeds will initialize create the fresh fixture/scope and call the real checkout function with a real authenticated fixture JWT. Provider TEST plan and callback are checked before the durable claim. The original checkout persists its operation/reference and provider claim before initialization. No provider key or auth token leaves the server. The runner does not send handcrafted payment webhooks. Observation uses genuine Paystack GETs and the shipped verifier, checks one exact receipt/period and25 untouched credits, and distinguishes provider-origin delivery from provider-API verification rows. The approved cancellation calls the shipped management function, verifies provider renewal stopped and local non_renewing, preserves the exact paid interval, and closes the scope. Uncertain provider writes remain claimed for review; no blind retry.

## Evidence and current limits

On 6 November the expired operator credential was rotated for the same approved run. A fresh database check found zero scopes, zero checkout claims, zero matching fixture accounts, nine receipts, and three credit ledger rows. Both global gates were disabled.

-144 local tests pass, including32 shared-policy/shipped-checkout checks and10 private-runner guards. An invalid capability-expiry guard failed before correction and passes after it.
-5 SQL private-RLS/budget/lifetime/customer-denial assertions pass in rehearsal and post-application; all fixture authorizations roll back, leaving0 enabled scopes/0 run claims at preflight.
- Checkoutv6, managementv5 and private matched acceptance helper v4 were deployed only to the isolated project; all fetched entry/dependency files match source. Both gatesfalse; receipts9/credit rows3 unchanged before initialization.
- Deployed public helper access returns401. The valid operator's observe request returns409 before initialization, without creating a payment.
- Source-secret/type/build/boundary checks and exact-commit CI are verified before the provider write. Production release remains HOLD regardless of this test's outcome.
- Frontend's global billing UI stays disabled; this is a bounded backend acceptance authorization. Browser/client/approved-coach/expired-session acceptance remains separate. No real user session is changed.

See [source parity](ai-billing-sandbox-source-parity-2026-11.json), [preparation evidence](ai-billing-approved-test-preparation-evidence-2026-11-04.json), [the approved plan](ai-billing-next-test-checkout-plan-2026-11.md) and [the preceding execution report](ai-billing-webhook-reliability-execution-2026-11-04.md). No broad permission to use existing users or bypass the scoped budget is inferred.
