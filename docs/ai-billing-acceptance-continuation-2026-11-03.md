# Billing acceptance continuation — 3 November 2026

Production remains unchanged. Both isolated gates remain disabled outside bounded tests.

## Replacement upgrade and regression fixes

The owner completed a Paystack TEST Starter payment of NGN 15,000 after the test harness verified the old provider subscription was non-renewing and moved only the disposable local fixture beyond expiry. Original dates remain recorded in fixture metadata; historical payment receipts were preserved. This is a temporal simulation plus an actual provider test payment, not evidence that a real month elapsed.

Run `billing-replacement-verify-20261103-c` passed 9 deployed checks: approved paid amount/currency/mode; shipped verifier activation; duplicate verification with one receipt; 50 credits; old local expiry retained; old provider renewal stopped; new payment-attributed lots; policy-gated credit access; new provider renewal stopped after acceptance.

Earlier attempts exposed two defects and were retained as failed runs. A second event for an existing payment receipt could restore an old period, and cancellation counted expired non-renewing history as a second subscription. Migration `20261103112351_prevent_ai_replacement_overlap.sql` fixes both and rejects new late payments that would overlap currently paid access. Provider invoice periods can begin at an earlier clock-hour boundary; expired historical periods do not themselves block a current replacement.

Four rollback-only SQL checks verify historical receipt replay, atomic rejection of a new overlapping payment, one currently paid subscription, and cancellation selecting the current replacement. The existing 17 billing checks pass after selecting unused fixture accounts and isolating retained subscriptions transactionally. No retained usage is deleted to make a test pass.

## Refund and security evidence

Eight rollback-only refund policy groups now include freeze-before-consumption, rejection of in-flight settlement after freeze, and safe reservation release. Earlier parallel consumption-first evidence remains separate. Both role self-promotion and self status mutation are blocked in the isolated baseline.

Actual Paystack TEST partial refund `18971821` for NGN 3,000 was requested once against the dedicated Starter payment and confirmed processed. Four deployed checks passed: shipped operator endpoint provider verification, duplicate adjustment idempotency, retained credit lots, and suspended-operator denial with the existing token. Test operator identities were suspended and banned after use. The remaining NGN 12,000 TEST refund `18972336` was requested once and is pending provider processing. Read-only status checks never reissue refunds.

The actual refund webhook uses `transaction_reference`; the previous helper did not recognize that field. The helper now accepts it, rejects conflicting references, and retains AI dispute events for review. New tests verify these paths and prevent marketplace mutation. Local suite: 57 passed. Isolated webhook deployed as v6.

## Provider-origin and schema boundaries

Paystack's documented Webhook Events API was queried for the replacement transaction and returned no events. No signed provider-origin delivery for that reference was observed locally. This does not establish the cause. API event lookup/retry cannot change the merchant's dashboard webhook URL. Current computer/browser control tools are unavailable, and no Paystack connector was found. Dashboard configuration remains unverified; manual signing is never reported as provider-origin evidence.

Read-only catalog snapshots covered 128 production tables and 136 isolated tables in the selected billing/marketplace/profile scope. Missing policies and the production profile role/status trigger body were copied into the isolated project through `tests/ai-billing-provenance-baseline.sql`. A different marketplace dispute-status constraint and 15 missing function signatures remain. Catalog snapshots are not a full schema export or production migration rehearsal.

Run `billing-history-replay-20261103-a` passed 4 signed HTTP checks: provider API re-verification of the original charge, unchanged expired old term, one old receipt, and one current replacement. This was a server-signed regression, not a provider-origin delivery.

Recurring renewal/failure, provider-origin delivery, bank-adjudicated dispute outcomes, full schema compatibility, expired-session/approved-coach browser coverage, and production policy approval remain mandatory release gates. Do not merge or deploy while they remain open.
