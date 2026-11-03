# Billing execution evidence — 1 November 2026

## Scope and release state

Repository: `tolulopemakinde/careerdevglobal`, existing PR #42, branch `fix/ai-billing-lifecycle-safety-2026-11`.
Initial audited head: `40f4a784c526da4492e56ee194d01aa1e041e7f3`.
Initial main/production frontend: `580032ffdb9cbff11c2b80bf1216cf35e9485529`.
Production deployment at audit: `dpl_GPvPkct95qfxq5ekfAuFKgSruFbQ`, READY.

Production database and Edge Functions have not been modified by this work. No live customer was charged, cancelled or upgraded. The owner authorized production release conditionally; unresolved mandatory gates keep this change unmerged.

## Audit findings and changes

The deployed Paystack webhook (v15) differed from repository source and used shared customer/plan fallbacks. A marketplace INSERT trigger independently wrote subscription state, including unsafe identity fallback and premature expiry. The old payment verifier did not check amount/currency and could report success without checking its database update.

Credit functions did not consistently enforce paid-through expiry. Runtime settlement was callable by customers, and early runtime exits could strand reservations. Database tests exposed ambiguous output-column references in existing credit/access functions. The migration and runtime changes address these paths.

No approved plan prices, credit costs, agent registry activation flags, governed prompts, historical records or production secrets were changed. Existing monthly credit allowance semantics remain monthly for annual plans as well. The imported runtime source came directly from deployed production v25; changes concern ownership, claims and credit settlement.

## Test results and their limits

| Layer | Actual result | Limit |
|---|---|---|
| Local automated behavior/specifications | 57 passed on 3 November | External services replaced in local handler tests |
| Disposable PostgreSQL | 17 assertions passed | Focused billing schema; not proof of full production schema parity |
| Consolidated migration | Applied in transaction, 17 assertions passed, rolled back | Development schema was also iterated using execute_sql; no production migration applied |
| Deployed endpoint/provider checks | 13 passed | Initial checkout only; no renewal charge in this group |
| Paystack paid lifecycle | 14 passed | Test-mode initial payment/cancellation/deferred scheduling; replacement payment after expiry still required |
| Signed HTTP concurrency | 4 passed | Identical invoice.create deliveries; not every mixed renewal/cancel ordering |
| TypeScript/source/boundaries | Passed | Build and authenticated browser evidence remain separate |

The first provider initialization attempt failed and remained pending; the later test fixture run with configured callback and a valid fixture email passed. No uncertain initialization was retried with a new reference for the same account.

One paid-lifecycle assertion initially compared ISO timestamp strings with different timezone formatting. It was corrected to compare parsed instants, then the complete paid lifecycle passed. This was a test assertion correction.

## W01–W16 coverage

| Scenario | Executed evidence | Remaining |
|---|---|---|
| W01 initial charge | Real Paystack test payment, verified activation/credits, SQL | Provider-origin webhook delivery configuration |
| W02 concurrent delivery | Two signed concurrent HTTP deliveries, one event | Mixed cancellation/payment concurrency |
| W03 interrupted event | PostgreSQL replay of pre-recorded event | Full HTTP interruption fault injection |
| W04 committed retry | Signed HTTP retry and duplicate verification, one receipt | None for tested delivery path |
| W05 conflicting customer identifiers | SQL rejection and local boundary tests | Signed provider payload matrix |
| W06 ambiguous code | Unique index rejects duplicate code | None for schema enforcement |
| W07 wrong signature | Deployed HTTP 401 and local no-write assertion | None for tested HMAC boundary |
| W08 late payment | SQL preserves terminal status | Provider-origin late delivery |
| W09 stale date | SQL paid date never shortens; new regression prevents old receipt granting a period twice | Provider-origin historical invoice replay |
| W10 failure then renewal | SQL attention/success transitions | Actual provider failed and successful recurring renewal |
| W11 cancellation during paid term | Real Paystack test disable; client and coach browser confirmation; retained paid date/credits | Provider-origin delivery |
| W12 expiry | SQL denies credits and agent access | Browser expiry/session flow |
| W13 marketplace collision | Local no-mutation test, 4 PostgreSQL assertions, 8 signed HTTP marketplace checks | Production schema compatibility |
| W14 unmatched identity | SQL quarantine with no customer/plan fallback | Operator remediation of a real unmatched renewal |
| W15 invalid dates | SQL rollback plus provider normalizer tests | Full signed malformed-payload matrix |
| W16 upgrade | Real deferred scheduling, labelled local expiry simulation, actual Starter TEST checkout/payment, 9 deployed checks including 50 credits and new renewal stop | Naturally elapsed period and provider-origin event delivery |

## Database/security

Authoritative new migration: `supabase/migrations/20261101140853_ai_billing_lifecycle_safety.sql`.
Adds unique payment receipts, operation claims, operator audit, runtime credit claim timestamp and a disabled release gate. Removes the legacy marketplace subscription-write trigger and browser mutation/TRUNCATE privileges. New privileged RPCs use an empty search path and service-only execution grants.

Observed test grants: authenticated cannot execute reconciliation or settlement; anon cannot claim runtime credits. RLS is enabled on new tables. The release gate is false after test runs. Advisors were inspected; the disposable project contains unrelated baseline findings, so no whole-project clean-security claim is made.

## Provider and production limits

The test secret authenticated successfully. The callback URL was saved in isolated project `yyevuwvtrktrzwuzeddo`; branch-specific public Vercel variables target that project. No production credentials were copied into testing.

Cancellation verifies exact subscription/customer/plan/price against Paystack, claims one disable operation, refetches stopped-renewal status, and atomically records local cancellation. A repeated request can reconcile provider success after database failure without issuing another disable.

Upgrades use an explicit replacement after expiry. Old renewal stops now; paid access remains; the higher plan is not activated by scheduling. Shared provider plans are never edited.

AI refund webhook events remain queued for operator review. A separate gated adjustment endpoint and payment-attributed credit lots were added on 3 November after owner approval for isolated implementation/testing. New verified receipts allocate monthly lots; historical attribution is never guessed. Privileged adjustments verify provider object/payment/currency/mode server-side. Full refunds revoke the funded lots, partial refunds preserve benefits and flag review, open disputes freeze lots, and final losses revoke them. SQL supports an explicitly verified win; the provider adapter deliberately sends ambiguous bank outcomes for review rather than treating a merchant's declined response as proof of a win. Provider-origin refund/dispute acceptance and a final bank-win evidence contract remain required before activation.

Seven rollback-only SQL policy groups passed, including standalone and cumulative full refund, partial refund, duplicate identity, open/won/lost disputes, stale opens, history preservation and service-only privileges. One parallel real-database consumption/refund test committed consumption first, then revoked unused credits; the historical consumed row remained intact. This does not establish all race permutations. The 17 existing billing assertions also passed after the policy migration. The operator endpoint is deployed only in the isolated project as v1. The refund-policy and billing gates were verified false afterward.

Authenticated client and coach browser checks on 1 November passed test checkout, verified payment, correct paid period/credits, renewal cancellation or deferred scheduling, and desktop/mobile layouts. Full approved-coach onboarding and expired-session testing remain separate gaps. Screenshots are retained in the task outputs directory.

The marketplace regression exposed incompatible intent statuses in the existing RPC. Migration `20261101151009_fix_marketplace_intent_webhook_statuses.sql` changes only those mappings to funded/reversed and preserves service-only invocation. The signed HTTP retest also rejects conflicting payloads under one provider identity with 409 and no duplicate ledger receipt.

## Build/dependency findings

The local Turbopack build could not resolve the reused dependency junction outside its filesystem root. A webpack attempt failed with `spawn EPERM`; neither result proves an application build failure in CI.

The package was pinned to Next.js 16.4.0, affected by GHSA-2464-fhr4-w9xw, GHSA-673q-mjm6-r5xr and GHSA-p3m5-59mp-jv5r. Official advisories identify 16.4.1 as patched. A patch update and lockfile validation are part of this continuation; exact-commit CI/Vercel evidence is recorded in the final report.

## Operator and rollback procedure

Replay is POST-only, authenticated, restricted to active staff/admin, and requires an audit reason. Re-verification precedes paid state changes. Do not manually mark events processed, attach an event by shared plan/customer identity, delete an event to replay it, or reissue a provider side effect with uncertain outcome.

Keep the release gate disabled until all mandatory checks pass. On incident, disable new billing actions first, retain compatible backend security fixes, preserve receipts/events/claims and compare provider state. Do not roll back by deleting billing data or restoring unsafe grants/triggers.
