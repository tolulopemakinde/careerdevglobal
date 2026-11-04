# CareerDev Global — AI-credit idempotency binding remediation (2026-11-04)

**Location:** Draft [PR #42](https://github.com/tolulopemakinde/careerdevglobal/pull/42), branch `fix/ai-billing-lifecycle-safety-2026-11`.  
**Status:** SQL **source remediation implemented** in the two existing draft migrations. **NOT** deployed to Supabase test or production. Runtime acceptance remains blocked.

## Why this change is necessary

Read-only inspection of the isolated Supabase project `yyevuwvtrktrzwuzeddo` showed that `public.reserve_ai_credits` can return an existing ledger for an authenticated user's repeated `idempotency_key` after checking operation, subscription, status and period **without confirming its stored `execution_id` and `request_id` match the new request**.

The RPC separately verifies that the *incoming* execution belongs to the caller, but that alone does not bind the *existing ledger* to that execution. The atomic `claim_ai_runtime_credit` RPC reduces duplicate provider-execution risk, but cannot substitute for correct credit provenance.

## Changes in PR #42

Both existing draft migration definitions were patched:
- `supabase/migrations/20261101140853_ai_billing_lifecycle_safety.sql`
- `supabase/migrations/20261101152243_ai_payment_refund_chargeback_policy.sql`

The existing-idempotency branch now fails closed when any of these bindings differ:

```sql
v_existing.execution_id IS DISTINCT FROM p_execution_id
OR v_existing.request_id IS DISTINCT FROM p_request_id
OR v_existing.agent_key IS DISTINCT FROM v_op.agent_key
```

They extend, rather than replace, the existing status, operation, subscription and period checks. `IS DISTINCT FROM` is deliberately null-safe. The later refund-policy migration retains `public.ai_payment_access_allowed(s.id)`; no removal of refund/chargeback entitlement gates is intended.

**Important deployment nuance:** These are changes to draft migration files, not an applied additive migration. The isolated Supabase database already has baseline migrations and its deployed function does **not** acquire these edits automatically. A new follow-on migration, generated using the authenticated Supabase CLI, must be reviewed and applied to a disposable/test environment after provenance and payment isolation are confirmed. Do **not** blindly replay historical draft migrations over existing schema. Production approval remains separate.

## Validation performed

1. Node regression test `tests/ai-credit-idempotency-binding.test.mjs` verifies that both draft migration definitions contain the exact same-execution, same-request and same-agent checks; it also confirms retention of important authorization, payment and locking structure.
2. [AI billing CI run 41827373887](https://github.com/tolulopemakinde/careerdevglobal/actions/runs/41827373887) passed **80 billing tests, 0 failures** on commit `cbbbe855ef552ede657885b11de192a249df3638`.
3. Executed a **read-only PostgreSQL VALUES/CTE** check on the isolated test project's server: six fabricated cases, **6 passed** (exact binding, different execution, different request, different agent, null existing execution, null existing request). The reproduction query is saved at `tests/ai-credit-idempotency-binding-readonly.sql`.
4. No rows from live users, payments, subscriptions or ledger tables were used for these six fabricated cases.

**Not yet verified:** An authenticated invocation of the *updated* stored procedure, per-user/identity RLS, actual advisory-lock behavior under concurrency, API credit settlement under real provider failure, migration compatibility of the already-applied sandbox baseline, and actual provider spend limits.

## Existing isolated-test environment safeguard

Prior aggregate-only inspections found **21 auth users** whose provenance as purely synthetic is not yet established. The project currently contains historical subscription and credit ledger records. Do not use those accounts for new paid inference or mutation tests. Confirm test-only users and payment/provider secrets before executing new database write fixtures.

## Next required actions

1. Recover or provision a dedicated disposable database or approve the existing isolated test environment after verifying account/payment isolation.
2. Generate a **new additive migration** with Supabase CLI from the latest known deployed `reserve_ai_credits` definition. Preserve `ai_payment_access_allowed`, subscription checks, per-user advisory lock, RLS and SECURITY DEFINER search-path protections.
3. Apply it **only in the approved disposable/test environment**, then run an authenticated transactional fixture using two distinct owned executions and the same idempotency key. The second request must return `allowed=false`/`idempotency_key_not_reusable` without modifying the first reservation. Repeated same-execution/same-request reserve must remain idempotent.
4. Verify concurrent claim/settle and failure/recovery semantics; record redacted evidence and check Supabase security advisors.
5. Keep PR #42 in draft until matched Paystack TEST delivery, refunds/chargebacks, entitlements, runtime and production release criteria all pass.

**Changes not made:** No production migrations, no Supabase DDL/DML/RPC calls, no real AI API calls, no financial state changes, and no PR merge/deploy.

## Additive migration prepared — 4 November 2026

- **Generated using Supabase CLI v2:** `supabase migration new bind_ai_credit_replay_to_execution` on a one-time GitHub Actions runner. Output: `supabase/migrations/20261104122023_bind_ai_credit_replay_to_execution.sql`. No login, production link, provider credentials or database connection was used during file creation.
- Populated the file from the **audited deployed test function** (`public.reserve_ai_credits`, 6,300-character source) rather than replaying earlier baseline migrations. Added null-safe equality checks for `execution_id`, `request_id` and `agent_key` in its existing-ledger branch.
- Included a strict **source fingerprint preflight**: the migration aborts if `pg_get_functiondef` differs from its observed test snapshot (MD5 `62d121ebc7076de1ac5aaf557e6d5749`), or if its payment-access or transaction-lock checks are missing. This is a source-drift marker, not a cryptographic access-control mechanism.
- Uses `CREATE OR REPLACE FUNCTION` without dropping the routine or changing existing `GRANT`/`REVOKE` rules; intended to preserve ownership, signature and invocation permissions. The sandbox's wider `anon` EXECUTE grant remains a separate security review.
- The one-time GitHub Actions workflow was **removed** after it scaffolded the migration. No contents-write workflow remains from this task.
- Added tests to verify the additive migration's fingerprint guard, null-safe bindings, unchanged payment/ownership/locking requirements and lack of unrelated schema/privilege commands.
- Verified the server's **read-only preflight** returned one expected signature, fingerprint match, preserved payment guard and lock, and `binding_fix_present=false` (the sandbox routine remains unchanged). Reproduction query: `tests/ai-credit-replay-migration-preflight-readonly.sql`.
- The targeted migration is intentionally not applied: existing test accounts (21 in previous aggregate read) have not been independently confirmed as synthetic; live payment/provider credentials and test data provenance remain outstanding.

**Safeguarded next step:** After explicit approval of synthetic-account provenance and financial/test environment isolation, take a source snapshot, review the migration, execute only against the intended isolated database, then run real authenticated idempotency and concurrent claim tests. *A passing CI build and read-only fingerprint match are not database integration evidence.*
