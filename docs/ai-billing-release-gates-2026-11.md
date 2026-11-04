# AI billing release gates — 1 November 2026

## Current evidence — 4 November 2026

**PARTIALLY COMPLETE — BLOCKED for production.** Genuine Paystack delivery of the original event now reports **Delivered / HTTP200 / attempt7** (3November21:07:36WAT), independently matched by webhookv10 Edge logs. The same signed event remains unassigned and unprocessed, with no financial mutation. No payment/refund/cancellation or resend was initiated during this resume.

The remote branch credit-security edits were preserved, its additive replay migration was completed from the deployed definition, and isolated database rehearsal plus seven post-apply authenticated-role checks pass. Source20261104122023 is recorded as TEST history20261104123708; current definition hashb9c0ffb6432e9f9da7d8010845df0e77 and ACL are verified. No production migration. Both gates remainfalse. All nine TEST bundles/20 files match reviewed source; final local suite102 passes. The earlier11 synthetic HTTP and six provider GET checks remain3November evidence. Six current local HTTP checks encountered transport errors rather than returning a result.

Read [the current full execution report with W01–W16 layers and owner actions](ai-billing-webhook-reliability-execution-2026-11-04.md), [fresh evidence](ai-billing-webhook-reliability-evidence-2026-11-04.json) and [acknowledgment contract](ai-billing-webhook-acknowledgment-contract-2026-11.md). W01/W08/W10/W11/W12/W16, client/approved-coach/expired-session acceptance, policy-enabled reversal tests and authoritative schema rehearsal still block production. Historical sections below retain earlier snapshots.


## 3 November acknowledgment continuation — historical snapshot

**PARTIALLY COMPLETE — BLOCKED.** Isolated webhookv10 now durably quarantines safe unmatched/manual-review events before HTTP200/processed:false. Invalid HMAC, conflicts and infrastructure/provider failures retain rejection/retry semantics. No schema change.88 local tests,11 deployed synthetic checks,6 fresh provider GET checks,7 endpoint boundaries and rollback-only SQL pass. Seven application bundles plus TEST helperv3 were fetched and match source. Both gates remainfalse.

The original genuine TEST event still reports Pending/503/six attempts; no post-fix provider200 is confirmed. One safety-checked documented resend did not confirm success; its uncertain claim is preserved and was not retried. No new charge/refund/cancellation was initiated. Coach mobile visual review now passes; client/approved-coach/true-expired-session acceptance and W01/W08/W10/W11/W12/W16 remain open. Existing financial hashes are unchanged, excluding only newly tagged nonpayment/failure fixtures.

Read [the current full execution report and W01–W16 layer matrix](ai-billing-webhook-reliability-execution-2026-11.md), [acknowledgment contract/operator recovery](ai-billing-webhook-acknowledgment-contract-2026-11.md), [redacted fresh evidence](ai-billing-webhook-acknowledgment-evidence-2026-11.json) and [proposed separately approved matched TEST checkout](ai-billing-next-test-checkout-plan-2026-11.md). Selected catalog comparison is not a production-shaped rehearsal. Historical sections below are retained; their503-by-design, mobile-capture and version9 notes describe earlier snapshots.


Latest evidence update, 3 November: standalone genuine Paystack TEST delivery now passes, including accepted HMAC, exact isolated destination, six automatic attempts/one unmatched event and unchanged financial hashes. Current local suite has 74 passes. This closes connectivity only; matched subscription acceptance, recurring/dispute evidence, schema rehearsal and remaining browser gates below still apply. Partial/full TEST refunds are already processed; older pending statements below are historical and must not cause a second refund request. See `docs/ai-billing-provider-webhook-delivery-2026-11.md` for the current W01–W16 matrix. Both gates remain false; no production release is authorized by this task.

Production release is authorized by the owner only after all mandatory acceptance criteria pass. No further routine source-edit approval is required. This document records evidence, not a release waiver.

## Implemented

- Server-scoped, serialized checkout using approved database prices and verified Paystack plan configuration.
- Exact reference/code matching; conflicting customer, plan, currency and amount checks.
- Payment receipt uniqueness plus atomic subscription/event updates in migration `20261101140853_ai_billing_lifecycle_safety.sql`.
- Initial subscription/invoice creation alone cannot activate paid benefits.
- Cancellation with durable provider-call claims, provider confirmation, and recovery after database synchronization failure.
- Deferred replacement upgrade: stop old renewal, retain current benefits, require a new checkout after expiry. No proration or shared-plan update.
- Audited staff/admin replay and service-only reconciliation/credit settlement.
- Paid-period expiry checks, account/agent ownership checks, credit claims, exactly-once settlement, release on unsuccessful runtime operations.
- Browser and server rollout gate defaults to disabled.
- Marketplace identity collision rejection and historical-event recognition.
- Owner-scoped management UI with confirmation dialogs, credit balance, plan comparison and verified payment history.

## Executed evidence

- 57 local tests: lifecycle specifications, shipped webhook behavior, provider normalization, upgrade eligibility, refund/dispute normalization and shipped runtime credit behavior.
- 17 disposable PostgreSQL assertions, including rollback, entitlement expiry, credit consumption/release, and function/table privilege checks.
- Entire consolidated migration rerun against a temporarily reset billing subset inside a transaction; all 17 assertions passed and the outer transaction rolled back.
- 13 deployed test-endpoint/provider checks passed.
- 14 Paystack test-mode paid lifecycle checks passed: payment, subscription creation, verification, duplicate verification, one receipt, credits, cancellation, provider renewal stop and deferred upgrade.
- 4 signed HTTP concurrency checks passed: concurrent deliveries, one event identity, committed retry, unchanged paid period.
- TypeScript, source audit and repository boundary/build-input checks passed.
- Test callback configuration saved; PR branch preview is scoped to the isolated database.

These counts do not mean every W01–W16 case passed at every layer. See the acceptance matrix and implementation report.

## Still required before merge or production deployment

1. Provider-origin recurring renewal and failed-renewal acceptance, including paid invoice event ordering and historical invoice replay.
2. Replacement checkout/payment/activation now pass 9 deployed checks after an explicitly labelled local expiry simulation with old provider renewal confirmed stopped. This is actual TEST payment evidence, not a naturally elapsed billing month. Four SQL regression checks cover old receipt replay, overlapping late payments, one current subscription and cancellation of the replacement.
3. Marketplace SQL and signed HTTP regression now pass (4 SQL and 8 HTTP checks); production compatibility remains required.
4. Client and coach desktop/mobile billing checks and keyboard confirmations passed. Complete expired-session and approved-coach onboarding coverage.
5. Final exact-commit GitHub checks and healthy Vercel preview with the patched dependency lockfile.
6. Scoped production/test catalog comparison captured 128 production and 136 test tables. Copied missing policies and the production role/status guard into the isolated baseline. Missing function signatures and a different marketplace dispute constraint remain; this is not full schema parity. Production provider webhook configuration remains unverified.
7. Owner approved isolated refund-policy implementation/testing. The disabled policy now has payment-attributed lots, audited adjustments, provider-verifying operator endpoint, 8 SQL groups and consumption/refund order checks. An actual TEST partial refund is processed; 4 deployed endpoint/authorization checks pass. The remaining refund is pending. Do not apply or reissue a pending refund. Provider-origin refund/dispute tests, a verified final bank-win contract and production activation approval remain required. Historical unattributed credits require explicit review. Refund/dispute webhooks remain queued for operator review.

## Release and incident sequence

Keep `ai_billing_release_config.self_service_enabled=false`. Capture current production function versions and the deployment/commit before release. Reconcile and apply the validated version-controlled migration, deploy the corresponding billing functions and credit runtime, verify permissions and backend compatibility, then deploy the application. Enable the gate only after mandatory evidence passes.

If an incident occurs, disable the gate first. Preserve signed events, receipts, ledger entries and operation claims. Reconcile provider state before retrying a side effect. Frontend rollback may be performed independently while compatible backend fixes remain. Do not delete payment events to force replay, discard receipts, restore the unsafe marketplace trigger, or restore customer credit-settlement privileges.
