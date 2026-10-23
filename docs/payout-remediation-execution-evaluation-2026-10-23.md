# Payout Remediation — Execution and Outcome Evaluation

**Evaluation date:** 2026-10-23  
**Production project:** `ufmhrmzumqkjvaezrmxf`  
**Repository:** `tolulopemakinde/careerdevglobal`  
**Branch:** `payout-remediation/evaluation-2026-10-23`  
**Mode:** Read-only production inspection plus documentation-only branch update. No production schema, data, grants, policies, secrets, or deployed functions changed.

## Executive outcome

**Status: BLOCKED for production remediation; READY for isolated test preparation.**

The payout migration history is now re-confirmed in production metadata, and the live transfer and payout-webhook function bodies have been retrieved. This materially improves source-of-truth evidence, but it does not recover the original SQL migration files. The exact deployed database function definitions are available as read-only snapshots and should be archived with hashes before any patch is prepared.

No code fix is approved for production because no schema-equivalent, isolated test environment is currently available. The separate project previously inspected is not equivalent, and the production project reports no development branches. Do not use production to test RPCs, transfers, webhook mutations, grant changes, or candidate migrations.

## Verified findings from live function definitions

### P0 — Release eligibility type mismatch

`marketplace_transactions.release_eligibility` is a text state (documented observed values include `blocked`, `eligible`, `released`, and `disputed`). The deployed `prepare_coach_payout_transfer(uuid)` function evaluates:

```sql
if tx.release_eligibility is distinct from true then
  raise exception 'Transaction is not release eligible';
end if;
```

That compares a text expression with a boolean and is incompatible with the observed column contract. This is a confirmed function/schema contract defect, not a speculative security issue. Correct the predicate to the approved text-state contract only after confirming all production values and the intended state machine. Unknown/null states must fail closed. Do not convert the column to boolean as a shortcut.

### P1 — Transfer function reports success without checking the database update

The active `careerdev-paystack-payout-transfer` Edge Function is version 9 with JWT verification enabled. It calls `prepare_coach_payout_transfer`, which sets the payout to `processing` and creates/reuses the stable `CDG-PAYOUT-<payout UUID without hyphens>` reference. After Paystack responds successfully, the Edge Function updates payout metadata/status but ignores the returned database update error and affected-row count, then returns `success: true`.

A provider-side success followed by a failed or zero-row database update can therefore be reported as successful to the caller while local state remains stale. The stable reference is a useful reconciliation control and must be preserved. Add explicit update-result validation and reconciliation handling before returning success.

### P1 — Ambiguous provider outcomes require reconciliation

The transfer request uses a stable payout reference, but failures and timeouts need explicit classification. A timeout or ambiguous response must trigger lookup/reconciliation by the stable reference before any retry; it must not blindly send a second transfer. Verify provider idempotency behavior and stored transfer identifiers in a test environment.

### P1 — Webhook state and event integrity

The active `careerdev-paystack-payout-webhook` Edge Function is version 8 with JWT verification disabled, which is expected for a provider webhook only if signature verification remains mandatory. The current body verifies the Paystack HMAC signature over the raw request body. It then:
- maps `transfer.reversed` to status `reversed`, while the observed payout status CHECK does not allow `reversed`;
- records event identity using `provider_transfer_reference` built from transfer code/id/reference, then treats duplicate insertion as non-fatal and still updates payout status;
- does not compare provider event amount/currency with the stored payout before updating status;
- does not guard against out-of-order state transitions before overwriting the payout status.

The schema and event-identity strategy must be deliberately reconciled. Do not merely add `reversed` to the status constraint or ignore duplicate events without checking downstream ledger/reconciliation behavior.

### P1 — Error redaction

The transfer endpoint includes `prepError.message`, provider messages, and caught exception text in response details. The webhook also returns caught exception text. Replace externally visible internal/provider details with stable generic errors and retain appropriately redacted server-side diagnostics.

### P1 — Payout account privileges

Prior read-only ACL inspection found broad table privileges on `coach_payout_accounts` for `anon` and `authenticated`, while the policies inspected were authenticated owner-scoped row policies. This is excessive privilege surface, but the inspection did **not** prove a successful anonymous read/write exploit. Before narrowing grants, map all browser and server-side access paths and test the least-privilege replacement. Row policies alone do not restrict which columns an owner can update.

## Migration/source recovery status

Production migration history includes these payout-related entries:

- `20260915170643` — `build_marketplace_coach_earnings_payout_engine_v70b`
- `20260915174257` — `build_marketplace_payout_release_controls_v86a`
- `20260915174305` — `add_marketplace_payout_release_check_v86b`
- `20260917143246` — `coach_payout_onboarding_v1`
- `20260917144539` — `coach_payout_history_rpc_v1`
- `20260917144919` — `admin_payout_approval_workflow_v1`
- `20260917144956` — `fix_payout_release_check_column_v1`
- `20260917145128` — `coach_payout_transfer_guard_v1`
- `20260924012905` — `harden_payout_and_trigger_functions`

These records establish which versions were applied, not the original SQL source. Repository search did not recover the historical payout migration files. Do not recreate old migration files under their original names or claim reconstructed SQL is the original source. Preserve the deployed function definitions, migration metadata, schema definitions, constraints, indexes, ACLs, and policies as separate evidence artifacts.

## Regression test gate

Run these tests only in a schema-equivalent isolated database with synthetic data and mocked provider calls. No test may invoke a real transfer or mutate production.

1. **Eligibility state contract:** `eligible` and `released` behave according to the approved state machine; `blocked`, `disputed`, NULL, and unknown values fail closed.
2. **Payout eligibility checks:** missing transaction/account, unverified recipient, non-default account, wrong coach, unpaid source transaction, currency mismatch, non-positive amount, unresolved reconciliation, open dispute, and refund exposure all block transfer.
3. **Authorization:** anon, ordinary authenticated user, coach, staff, and admin receive only their intended RPC/endpoint permissions; admin/staff checks are performed server-side.
4. **Concurrent transfer attempts:** two simultaneous requests cannot initiate duplicate transfers; payout row locking and stable reference remain effective.
5. **Provider success + DB update failure:** endpoint must not report fully reconciled success if persistence fails; system enters a reconcilable state.
6. **Provider timeout/ambiguous response:** lookup by stable reference occurs before retry; no duplicate transfer is created.
7. **Webhook signature:** missing/invalid signatures are rejected; valid signatures are computed against exact raw bytes.
8. **Webhook amount/currency mismatch:** event is rejected/quarantined and payout state is not advanced.
9. **Duplicate event:** exact retry is idempotent; a second lifecycle event for the same transfer is not accidentally discarded as a duplicate.
10. **Out-of-order event:** stale/invalid transitions cannot overwrite a later valid state.
11. **Reversal:** behavior is consistent with an explicitly approved schema/status/ledger model; no invalid CHECK-constraint update is attempted.
12. **Webhook payload safety:** sensitive payload fields are minimized/redacted in storage and logs.
13. **Error disclosure:** client responses are generic; provider/internal exceptions are not returned verbatim.
14. **Amount precision:** major/minor unit conversion uses a decimal-safe representation and rejects unsafe integers/rounding ambiguity.
15. **Database ACL/RLS:** anon and authenticated roles cannot write privileged payout-account fields or alter transaction/payout financial state outside approved paths.
16. **RPC grants:** SECURITY DEFINER functions have explicit required-role grants and internal role/ownership checks; PUBLIC/anon execution is removed only after call-site verification.
17. **Migration replay:** a clean isolated database can be built from the recovered authoritative migration set and matches the inspected production payout schema.
18. **Rollback rehearsal:** candidate schema/code changes can be rolled back without losing payout audit history or creating inconsistent provider state.

## Execution log and evaluation

| Work item | Outcome | Evidence / gate |
|---|---|---|
| Re-read production migration history | Complete | Payout migration versions listed above; original SQL still absent |
| Re-read active payout transfer/webhook function bodies | Complete | Transfer v9 SHA-256 `f43b51e553774748e901bbfa2eecdf5658f00ce0b239b17a0edca9bd3ac46575`; payout webhook v8 SHA-256 `c2c9f3614f2d87b501416cb5f7f7eb8c328ab064cd5534a2f0f8165a1c185755` |
| Confirm isolated Supabase branch availability | Blocked | Production returned no development branches |
| Validate alternate project as equivalent | Failed / unsuitable | Prior inspection found no matching migration history or payout schema |
| Prepare safe regression criteria | Complete | Test gate above |
| Implement candidate SQL/Edge Function fixes | Deferred | Must first establish representative isolated environment and schema parity |
| Execute regression tests | Not run | No safe, equivalent environment and provider mocks available |
| Deploy/merge/modify production | Not performed | Explicitly prohibited by the current safety boundary |

## Next safe step

Recover the original migration SQL from any surviving local clone, CI artifact, developer machine, prior pull-request diff, backup, or database migration archive. In parallel, establish a non-production project in an organization the user explicitly authorizes and confirm the cost before creating anything billable. Reconstruct a *new* forward-fix migration only after comparing the live schema with the recovered sources; label it as a new remediation migration, not as recovered historical SQL.

**Release decision: NO-GO.** The type mismatch and webhook/transfer correctness risks are material. Do not enable or expand real payout activity until the isolated regression suite passes, the schema contract is approved, and an explicit production-release authorization is obtained.


## Follow-up source-recovery sweep and CI evaluation

A second repository sweep inspected the recursive Git trees for the following nine accessible branches: `main`, `audit/security-remediation-2026-10-23`, `payout-remediation/evaluation-2026-10-23`, `phase-1-safety-foundation`, `phase-2-server-hardening`, `phase-3-distributed-quotas`, `phase-4-preview-validation`, `security/baseline-response-headers`, and `security/profile-role-authorization-review`.

- No historical payout SQL migration was found on these branch snapshots.
- The only migration file found in those trees is `supabase/migrations/20261012104600_secure_profile_role_and_status_integrity.sql` on the profile-role security branch; it is unrelated to payout history.
- `docs/phase-3/preview-distributed-quotas.sql` is a preview control script, not a payout migration.
- The latest security-audit workflow run inspected for PR #29 has no uploaded artifacts. Thus it provides no migration archive recovery path.
- The payout-related GitHub commits found by search describe application/UI changes, not original payout SQL migration source. Commit diffs examined for admin release controls confirm application code, not database migration SQL.

### CI source-audit failure examined

The Phase 1 validation workflow on PR #29 failed at `npm run audit:source`; TypeScript, build, and later validation steps were skipped. The reported match was `supabase/functions/careerdev-coach-matching/index.ts: Supabase service-role secret`.

Inspection of the source and `scripts/audit-source-config.mjs` shows that this finding appears to be a **scanner false positive**: the handler references service-role credentials via environment-variable names (`CAREERDEV_SERVICE_ROLE_KEY` and fallback `SUPABASE_SERVICE_ROLE_KEY`), and the audit rule broadly matches the string `SUPABASE_SERVICE_ROLE`. No literal credential value was present in the matched line. The scanner's sanitization removes only the exact fallback expression, not the alternate environment-variable name, so it still flags the line. This does **not** establish that all repository source is secret-free; it means this particular failure is not evidence of a leaked key. Fix the scanner separately by distinguishing environment-variable lookups from literal credential assignments, then rerun the source audit and all skipped checks. Do not print or expose secret values during that work.

### Updated recovery conclusion

The additional branch-tree and CI-artifact sweep strengthens the finding that the original payout migration SQL is not present in the currently accessible repository history snapshots or available workflow artifacts. It does not rule out a developer's local clone, deleted Git refs, prior unindexed commits, external backup, or database-platform backup. Continue searching those sources before deciding that reconstruction is necessary.

### Follow-up log

| Follow-up action | Result |
|---|---|
| Recursive Git tree search across 9 branches | Complete; no payout SQL migrations found |
| Inspect matching SQL migration | Complete; one unrelated profile-role migration |
| Inspect recent payout UI commits | Complete; application files only |
| Check PR #29 workflow artifacts | Complete; none uploaded |
| Diagnose failed CI source audit | Complete; apparent false positive on env-var reference |
| Run skipped build/type/security checks | Not run; workflow stopped at source audit failure |
| Patch source-audit script | Deferred; should be a separate reviewed change with positive and negative tests |
