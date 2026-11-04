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
