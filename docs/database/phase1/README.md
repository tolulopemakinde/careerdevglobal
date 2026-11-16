# Phase 1 evidence — 16 November 2026

**Decision: PARTIAL / HOLD. Phase 1 is not complete and production release is not authorized.** Production and the populated AI test project were inspected read-only. No production schema, RLS, records, provider appointments, billing gates or deployments were changed. No payment, paid project, upgrade or add-on was created.

## 1. Authoritative database recovery

Production `ufmhrmzumqkjvaezrmxf` has 229 migration ledger records. Contrary to the earlier missing-history assumption, all 229 SQL bodies are available in the ledger's `statements` column and were recovered by owner-authorized SELECT. There are no recorded rollback bodies. The archive preserves hashes and explicitly marks one privacy-redacted bootstrap administrator identity; 228 bodies remain byte-exact. No historical SQL was invented. Do not replay this archive blindly: it contains historical scheduling and managed-service operations.

The current-state capture inventories 243 application tables, 50 views, 232 application functions, 3,546 columns, 1,187 constraints, 718 indexes, 377 RLS policies, 43 application triggers, 7 enums, 7,670 expanded relation grants, 752 function grants, 96 default grants and 9 source extensions. It includes application-owned triggers on managed schemas and their policy dependencies, not managed Auth/Storage service definitions or customer data. All 23 literal RPC names found across 29 deployed Edge bundles resolve to captured functions; dynamic references still need runtime acceptance. See [dependency reconciliation](dependency-reconciliation.json) and the sanitized Edge inventory under `supabase/baseline`.

The deterministic current-state SQL is outside `supabase/migrations`. It is a reconstruction snapshot, not a replacement production migration history or a native owner `pg_dump`. A native owner-authorized schema-only dump was not available through the connected tools. Original private captures are not committed. The bootstrap email/display name are redacted and their original definition hash retained. No customer rows or credentials were exported.

[Reconstruction comparison](reconstruction-result.json) passes all compared application catalog sections in a clean, network-disabled PostgreSQL 17 fixture. [Backup/restore comparison](restore-result.json) also passes. This does **not** establish managed-service parity: source PostgreSQL is 17.6, local is 17.12; four managed extensions and actual Auth/Storage services are absent. Local helper adapters are explicitly substitutes, not recovered managed schemas.

## 2. Disposable environment and cost decision

Organization `wchsevschfwxxoyandhp` is on Free (`tier_free`) and already has two active projects: production and populated AI test. The connected cost API returned a generic $0/month project quote, but the project creation API rejected the requested disposable project at the two-active-free-project limit before creation. There is no eligible additional free slot. No upgrade, paid compute or billable add-on was enabled. The tools did not supply a complete paid quote covering compute, usage and add-ons, so there is no approved paid provisioning proposal.

A full local Supabase CLI stack was evaluated first and failed image extraction because the workspace has an 8 GB disk. The lower-footprint alternative succeeded: pinned pgvector/PostgreSQL 17, no network, no host port, read-only repository mount, synthetic-only tmpfs database and strict fixture-label guards. This incurs no new Supabase resource charge. It is useful for SQL/RLS/recovery acceptance; it cannot prove Supabase Auth login, JWT issuance, Storage API or provider webhook acceptance. More local disk for a full Supabase stack is the preferred next infrastructure step before recommending payment.

## 3. Synthetic setup and acceptance

Six synthetic identity rows represent two clients, two approved coaches (one paused), one pending coach and one active administrator. These are **database adapters, not working Auth login accounts**. Fixtures include approved/pending onboarding, service offerings, availability, one assignment, synthetic private object metadata, deterministic vectors, career records and nonpurchasable zero-price subscription records. No provider payment or genuine subscription was created.

| Evidence | Result | Meaning |
| --- | --- | --- |
| Renderer/archive regression | 7/7 pass | Hash preservation, deterministic generation, fail-closed unsupported catalog shapes |
| Baseline role acceptance | 9/17 pass | Reproduces four unrelated-client coach reads, directory denial, vector lookup failure and coach edit failure |
| Local candidate role acceptance | 16/17 pass | Directory, vector retrieval and assignment restrictions corrected locally |
| Restored fixture acceptance | 16/17 pass | Same bounded results after synthetic backup/restore |
| Existing #48 booking SQL against restored full application schema | Original fails; candidate returns `requested` | Fixes nonexistent event columns; both booking attempts rolled back |

The remaining test fails when an authenticated coach edits their own profile: `mark_coach_semantic_profile_stale()` cannot access `coach_semantic_profiles`. Do not grant broad table access or simply turn the trigger into a privileged function. Design a narrowly authorized invalidation path and independently test approval/publication integrity, then rerun the full matrix. An incidental permission failure is not evidence that approval escalation is safely prevented.

## 4. Marketplace diagnosis and candidates

Privileged production aggregates show one approved coach and two eligible services, while anonymous directory calls fail EXECUTE permission. The frontend currently turns these errors into empty arrays. The #48 continuation distinguishes unavailable results from a genuine empty directory.

The local SQL candidate grants anonymous execution only to the two approved public directory projections. Raw semantic matching evidence remains denied to anonymous users. Four coach-wide SELECT policies are narrowed to record owner, authorized active staff/admin, or the assigned active coach. Synthetic negative tests prove unrelated clients are hidden.

Matching has three additional integration faults: the deployed Edge function uses a publishable client for restricted retrieval; vector SQL filters the unsupported status `approved` instead of `verified`; and its search path does not resolve the vector cosine operator. The reviewed local SQL candidate uses explicit `extensions.<=>` resolution and current approval/onboarding/availability rules. The #48 Edge candidate performs restricted retrieval with server authorization after input validation and preserves the public response whitelist and quotas. Three source-boundary tests pass. Deno compilation, embeddings/provider execution, authenticated browser matching and deployment acceptance remain open. SQL candidates remain outside migrations and were applied only to the disposable local fixture.

## 5. Scheduling and billing readiness

Continue #48 and #42; do not duplicate their implementations. Calendly read-only inspection confirms a connected account on Basic/free, two event types, and one structurally suitable active solo/instant/unpaid type without required questions. This is **not** confirmed sandbox designation or proof that CareerDev's OAuth application is configured correctly. Production connection metadata records `users:read event_types:read scheduled_events:write`; an explicit `scheduled_events:read` grant was not recorded. Verify current provider requirements and actual read access in the acceptance account. Do not reconnect production.

Before provider tests: identify a nonproduction host and synthetic invitee, confirm plan/API eligibility, exact OAuth callback and scopes, separate encryption/webhook secrets, signed webhook verification and callback reachability. Test booking, competing claims, uncertain retries, cancellation, repeated hosted rescheduling, stale webhook recovery and the original payment/transaction linkage. No live appointments were created or cancelled during this phase. The SQL booking test is not a provider acceptance result.

Paystack #42 remains the billing source of truth. Its 144 isolated tests pass again in this phase; earlier matched TEST purchase and renewal-stop records remain historical evidence, not new authorization. Production release gates remain disabled; no shared TEST settings were changed. Fresh TEST readiness requires an isolated acceptance backend, TEST-only credentials and callback/webhook configuration, synthetic owner login, exact plan/currency/amount and reconciliation visibility. No production secret should be copied into the fixture.

| TEST scenario | Required evidence / approval boundary |
| --- | --- |
| Purchase and owner callback | Explicit approved TEST plan, currency and amount; matching signed event, transaction, subscription, credits and owner session |
| Upgrade/replacement (W16) | Separate approved natural eligibility sequence; no overlapping subscription or double credits |
| Cancel, renewal and expiry (W08/W10/W12) | Provider-controlled lifecycle and correct paid-through/expiry; no invented paid event |
| Refund/reconciliation | Explicit refund policy and approved TEST operation; idempotent ledger/credit/payout effects and delivery retry recovery |
| All transactions | Exact one-use test scope, gates closed afterwards, stop on uncertain side effects; never silently retry a charge/refund |

No financial operation is authorized merely by this preparation document. Keep production billing gates off.

## 6. Safe fixes and validation

The consolidated audit branch contains Help Center query/count/no-result fixes, keyboard skip-target accessibility and the Next.js 16.4.6 security patch. Its current-phase source audit/typecheck and existing verification checks passed before local dependency cleanup; 4 Help Center tests and 139 synthetic AI tests passed. Prior build and bounded browser checks passed. The #48 continuation has 93 scheduling/security/directory/scanner tests plus 3 matching boundary tests; the scanner exception is exact-file/exact-variable only, with negative tests. These do not constitute live provider acceptance. Dependencies/build caches were removed only to accommodate local database images; no source was removed. Remaining dependency audit findings were seven moderate issues, no high/critical, at the checked patched lockfile.

The new database CI verifies archive integrity and catalog reconstruction only. A green check cannot imply the known-failing 17-case matrix, real Auth/Storage, provider readiness or release approval. Current remote CI must be evaluated at the final published commit, not an older green SHA.

## 7. Dependencies and merge recommendation

Keep #36 and #48 in review until their current-main conflicts and exact-head checks are resolved. #34 → #35 → #36 are an ancestry chain; #44 → #48 is another chain. Do not merge each independently. #39 overlaps #42 runtime/webhook changes and needs reconciliation. The consolidated safe-fix/audit PR can be reviewed independently, subject to exact-head CI. Do not merge its production-targeting branch during this phase.

Recommended order after review: safe frontend/security fixes; reconcile the historical baseline chain and land its evidence without applying it to production; approve new marketplace/isolation migrations after real managed-service rehearsal; consolidate scheduling ancestors into #48; consolidate billing work into #42; then authenticated/provider acceptance and release gates. A merge is not permission to apply a production schema or enable billing.

## 8. Exact Phase 2 actions

1. Resolve coach semantic invalidation and approval integrity with narrow authorization; rerun all 17 local cases and add meaningful approval/publication regression cases.
2. Provide more disk for a full isolated local Supabase stack, or obtain a complete owner-reviewed paid quote for cloud capacity. Preserve both existing projects. No spending until explicit approval.
3. Rebuild with actual managed Auth/Storage, create genuine synthetic Client/Coach/Admin logins, run browser ownership/assignment tests and verify backup/restoration including managed-service boundaries.
4. Review candidate SQL and Edge authorization together; compile Deno, verify embedding execution and run matching/booking against the isolated backend. No raw evidence in public responses.
5. Verify acceptance Calendly OAuth/plan/callback/scopes, then run approved booking/cancel/reschedule/concurrency and payment-linkage cases.
6. Obtain exact TEST financial approval and run remaining #42 lifecycle/refund/reconciliation scenarios in isolation; keep production gates disabled.
7. Resolve branch ancestry/conflicts, require exact-head CI and preview end-to-end evidence, then assess production release gates separately with explicit release approval.

## 9. Outstanding owner access / cost requirements

No new spending is proposed without a complete quote. Needed access is sufficient local disk/Docker for managed Supabase, or separately approved cloud capacity; nonproduction Calendly OAuth application settings and host eligibility; TEST Paystack configuration and narrowly scoped financial approval; and eventually owner-authorized production release review. The present evidence supports a reproducible application-database fixture, not the full Phase 1 success criterion.
