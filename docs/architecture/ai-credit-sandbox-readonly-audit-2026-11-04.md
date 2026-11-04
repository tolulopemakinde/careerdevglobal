# Read-only AI credit sandbox diagnostics — 4 November 2026

**Environment:** Supabase test project `careerdevglobal-ai-test` (`yyevuwvtrktrzwuzeddo`).  
**Mode:** Read-only metadata + aggregate database SQL. No rows with user identifiers were selected. No DDL, DML, RPC writes, account changes, billing actions, provider calls, or production changes.

## Verified sandbox RPC contract

`claim_ai_runtime_credit(p_ledger_id, p_user_id)`:
- Service-role-only guard via `auth.role()`.
- Single conditional `UPDATE` on a matching `ai_credit_ledger` row with `status='reserved'`, `runtime_claimed_at IS NULL`, exact `id` and `user_id`.
- Returns `true` only when exactly one row is updated, providing an atomic single-claim boundary.

`settle_ai_credit_charge(p_ledger_id, p_user_id, p_outcome, p_metadata)`:
- Service-role-only guard.
- Validates outcome as `consumed` or `released`.
- Uses `SELECT ... FOR UPDATE` to serialize settlement by ledger row.
- Requires an existing claimed reservation; a prior-settled ledger returns `{status: existing, duplicate:true}`; newly settled returns `{status: outcome, duplicate:false}`.

`reserve_ai_credits(p_operation_key, p_execution_id, p_request_id, p_idempotency_key, p_metadata)`:
- Requires authenticated `auth.uid()`, active profile, matching owned execution for a chargeable agent, active entitlement, approved operation and sufficient credits.
- Uses a user-scoped advisory transaction lock to serialize reservations.
- **Open issue for billing PR #42:** the `v_existing` idempotency branch checks user ID, idempotency key, operation key, subscription, period and non-released status, but does **not** explicitly compare `v_existing.execution_id` or `v_existing.request_id` against the current `p_execution_id` / `p_request_id`. A reused key across distinct owned requests could return a ledger associated with the earlier request. The downstream single-claim requirement limits duplicate provider execution, but accounting association requires explicit review and regression tests. This is a source-level concern, **not** proof of unauthorized billing.

## Aggregate-only ledger observations

| Metric | Observed |
|---|---:|
| Total credit ledger entries | 3 |
| Consumed | 2 entries, 5 credits |
| Released | 1 entry, 3 credits |
| Reserved | 0 |
| Reserved and runtime claimed | 0 |
| Claimed reservations older than 30 minutes | 0 |
| Unclaimed reservations older than 30 minutes | 0 |

Existing consumed/released rows were not inspected individually. They had no populated `runtime_claimed_at` value in the aggregate inspection; this alone does not prove they are invalid, since they may predate the new test runtime claim protocol.

## Reproducible read-only SQL

Run on the **test project only** with read privileges. It returns counts, not personal records.

```sql
SELECT status,
       COUNT(*) AS ledger_rows,
       COUNT(*) FILTER (WHERE runtime_claimed_at IS NOT NULL) AS runtime_claimed,
       COALESCE(SUM(credits), 0) AS credits
FROM public.ai_credit_ledger
GROUP BY status ORDER BY status;

SELECT
       COUNT(*) FILTER (WHERE status = 'reserved') AS reserved_total,
       COUNT(*) FILTER (WHERE status = 'reserved' AND runtime_claimed_at IS NOT NULL) AS reserved_claimed,
       COUNT(*) FILTER (WHERE status = 'reserved' AND runtime_claimed_at IS NOT NULL
         AND runtime_claimed_at < now() - interval '30 minutes') AS claimed_older_30m,
       COUNT(*) FILTER (WHERE status = 'reserved' AND runtime_claimed_at IS NULL
         AND created_at < now() - interval '30 minutes') AS unclaimed_older_30m
FROM public.ai_credit_ledger;
```

## Required acceptance additions for billing PR #42

1. **Idempotency binding:** Reusing one idempotency key with a different execution/request for the same authenticated user must fail closed, with no new claim, provider call or change to the previous ledger.
2. **Duplicate claimed execution:** The same execution submitted concurrently may reserve the same ledger, but only one invocation may claim it; the loser must not settle the winner's credit.
3. **Post-claim lease/recovery:** Document and test how a crashed runtime's claimed but still reserved ledger is reconciled without double charge or improper release. A 30-minute threshold here is diagnostic only, **not** an authorization to auto-release.
4. **Settlement ambiguity:** Timeout after a database commit must not trigger an unverified second charge or an automatic opposite settlement; reconcile by inspecting the authoritative ledger.
5. **No free-credit conflation:** Staff or zero-credit operations can return `ledger_id=NULL`; handle as explicit no-charge operations rather than treating them as normal claimed reservations.
6. **Provenance:** The test project has 21 auth accounts whose synthetic origin is unverified. Do not run live paid inference using these records until accounts, subscriptions and payment credentials are confirmed test-only.
7. **Keep provider routing off:** This PR #43's simulation is not a Supabase runtime migration or a substitute for the actual PR #42 test environment billing contract.

**Release status:** HOLD. Exact post-change SQL and concurrent runtime tests must be verified in PR #42 before accepting OpenAI/Groq live credit-fallback integration. Neither project was mutated by this audit.
