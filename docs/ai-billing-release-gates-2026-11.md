# AI billing release gates — 1 November 2026

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

- 35 local tests: lifecycle specifications, shipped webhook behavior, provider normalization, upgrade eligibility and shipped runtime credit behavior.
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
2. Complete higher-plan replacement checkout/activation after verified expiry; scheduling alone is not complete upgrade acceptance.
3. Signed marketplace payment/refund regression through the real database, with state-sync ledger assertions.
4. Authenticated client and coach UI testing on desktop/mobile, keyboard confirmations, loading/errors and expired sessions.
5. Final exact-commit GitHub checks and healthy Vercel preview with the patched dependency lockfile.
6. Verify full production/test schema provenance, all required function/default/trigger/policy contracts, and production provider webhook configuration.
7. AI refund/reversal reconciliation is quarantined and requires a verified reversal policy; automatic paid entitlement reversal is not implemented.

## Release and incident sequence

Keep `ai_billing_release_config.self_service_enabled=false`. Capture current production function versions and the deployment/commit before release. Reconcile and apply the validated version-controlled migration, deploy the corresponding billing functions and credit runtime, verify permissions and backend compatibility, then deploy the application. Enable the gate only after mandatory evidence passes.

If an incident occurs, disable the gate first. Preserve signed events, receipts, ledger entries and operation claims. Reconcile provider state before retrying a side effect. Frontend rollback may be performed independently while compatible backend fixes remain. Do not delete payment events to force replay, discard receipts, restore the unsafe marketplace trigger, or restore customer credit-settlement privileges.
