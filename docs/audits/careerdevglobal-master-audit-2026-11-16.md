# CareerDev Global master audit — 16 November 2026

See the [published Phase 1 review status](phase1-published-review-status.md) for verified final PR checks, current mergeability and the scope of the local Supabase Auth result.

## Phase 1 evidence update — 16 November 2026

**Phase 1: PARTIAL / HOLD; production release remains HOLD.** The continuation of [PR #36](https://github.com/tolulopemakinde/careerdevglobal/pull/36) contains the full evidence and recovery runbook (`docs/database/phase1/`). All 229 historical migration bodies were recovered from the production ledger; one bootstrap identity is explicitly redacted, with provenance hashes retained. The earlier assumption that historical SQL bodies were unavailable is superseded. Application catalog reconstruction and synthetic backup/restore comparisons pass; this is not a native production dump or real managed Auth/Storage parity.

The selected Supabase organization is Free with two active projects and no eligible additional free slot. A generic $0 quote did not establish capacity: project creation was rejected before provisioning. No paid resources, upgrades or add-ons were created, and no complete paid quote was available. Full local Supabase image extraction exceeded the 8 GB workspace disk. A smaller network-disabled PostgreSQL 17 fixture works with six synthetic identity adapters, not working Auth login accounts.

Baseline role checks: **9/17 pass**. Local candidate and restored checks: **16/17 pass**. Anonymous directory grants, vector status/operator resolution and assigned-coach isolation are corrected only in local candidates. The remaining failure is authenticated coach profile editing through `mark_coach_semantic_profile_stale()`; a narrow invalidation/approval-integrity design is still required. Existing #48 booking SQL was exercised against the restored full application schema: original fails on event columns, candidate returns `requested`, with booking transactions rolled back.

Fresh isolated checks: **7 database regression tests, 96 scheduling/security/directory/matching-boundary tests and 144 billing tests pass**. Current-phase frontend validation also passed 4 Help Center and 139 AI tests plus typecheck/source checks before dependency-cache cleanup; prior build/browser evidence remains bounded. Deno/provider compilation and real authenticated/provider acceptance are pending. Calendly is Basic/free with one structurally suitable event type, but sandbox designation, app callback and sufficient OAuth scopes are unverified. Paystack remaining lifecycle/refund cases require isolated TEST readiness and explicit financial scope; no new payment or provider mutation was performed.

Next: fix coach invalidation safely; obtain sufficient local disk for real Supabase services or an exact owner-approved cloud quote; create genuine synthetic logins; compile/test matching; complete Calendly and approved Paystack TEST acceptance; reconcile PR ancestry/conflicts and exact-head CI. Production and populated AI test remain unchanged. Passing catalog CI cannot satisfy release gates.

## Original audit baseline (superseded where noted above)

**Decision: HOLD for unrestricted production release.** A controlled pilot is a conditional target, not a completed acceptance result. This is an AI-powered Career Intelligence Platform with operational, professional-service, governance, subscription and scheduling layers; it must not be assessed solely as a marketing site.

## Evidence rules and scope

Read-only GitHub, Vercel and Supabase inspection preceded development changes. Findings use live metadata/catalogs, deployed function source, local branch source, actual CI records and bounded tests. The earlier unauthenticated browser audit is historical public-journey evidence only. A private feature is not missing merely because it requires login.

High confidence means directly inspected current deployment/catalog/source or an observed bounded test. Medium means implementation or recorded historical evidence exists but the full workflow was not exercised. Unknown means no sufficient evidence. Passing compilation, a READY preview, an active registry row and a successful isolated test are different claims.

The machine-readable [evidence snapshot](evidence-2026-11-16.json) records exact SHAs, function versions, migration counts, permissions, aggregate inventory and CI identities. No credentials, customer documents, customer identifiers or raw financial payloads are included. Observation date is 16 November 2026; operator-facing timezone is Africa/Lagos (UTC+1).

## Deployment/source baseline — high confidence

| Boundary | Current evidence | Meaning |
| --- | --- | --- |
| GitHub main | `8ca79c0ea5124ea55d8f7aa81f0ab4451ac15580`, 6 November | Gateway synthetic evaluation merged as dormant tooling |
| Vercel production alias | `careerdevglobal-nine.vercel.app` resolves in Vercel metadata to `dpl_A986PDDr4nYxKHPCfFd82Bc8cHfa`, same SHA, READY | Main and this production frontend currently agree; this was verified, not assumed |
| Latest deployment overall | PR #48 preview `0af7e6ac483a66c68b63e084f036c94ec1ecd29a`, READY | Latest overall is not production |
| Custom domain | Project-domain listing returns only `careerdevglobal-nine.vercel.app`; `careerdevglobal.com` is not attached there | Ownership/DNS/hosting relationship must be confirmed. Shell CONNECT was denied by this environment, which does not prove the domain is down |
| Production Supabase | `ufmhrmzumqkjvaezrmxf`, careerdev-global, eu-west-1, PostgreSQL 17.6.1.166 | ACTIVE_HEALTHY is service health, not application acceptance |
| AI test Supabase | `yyevuwvtrktrzwuzeddo`, careerdevglobal-ai-test, PostgreSQL 17.11.0.003 | Populated shared test environment; do not assume disposable |
| Migration history | Production 229 records; AI test 25; main contains one historical SQL migration | Source-of-truth recovery remains unresolved; record counts are not schema equivalence |
| Recorded migration mismatch | Source `20261028000000` corresponds to live ledger `20261027234854` for Calendly fallback | Do not blindly replay histories or rename applied versions |
| Edge runtime | Production AI v25 vs test AI v2; production booking v12; matching v17; OAuth v11 | Frontend SHA does not version these independently deployed services |
| Deployment CI | Main run 42153732953 SUCCESS | Build/test evidence only; no signed-in launch acceptance |

Vercel environment **names/targets only** were reviewed. Branch-scoped Supabase URL/publishable-key overrides exist for billing and scheduling previews. Scheduling points at a deliberately non-routable fixture target, so its READY preview is not a connected booking environment. Preview GROQ_API_KEY and JINA_API_KEY names and production BREVO_API_KEY are present. No project OPENAI_API_KEY, AI_GATEWAY_API_KEY or Sentry DSN names appeared in that listing. This does not establish Supabase Edge secret presence/absence; those values were not retrieved.

## Confirmed defects and material risks

### P0: genuine inventory is hidden by authorization failures

Privileged aggregate reads found one approved coach, one verified/active marketplace profile, two active offerings and one active Calendly connection. Owner-context directory counts returned one coach and two services. No coach identity was exported.

Anonymous calls to both public directory RPCs returned HTTP 401, SQLSTATE 42501, permission denied. Catalog checks independently show anon EXECUTE false. Both public page loaders catch failures and return `[]`, rendering misleading no-inventory messages. Thus the prior public finding was an observable failure, but the assumption of absent inventory is incorrect. Restore only the intended public projection after permission/privacy review and disposable rehearsal; never publish unapproved profiles or grant broad table access.

Production matching v17 constructs a publishable client and calls `get_public_coach_matching_candidates` and `find_public_coach_matches`; both also deny anon EXECUTE. The previous browser search returned temporarily unavailable. Permission failure is a confirmed incompatible boundary; distributed limiter configuration can fail earlier and was not independently excluded. There is further eligibility drift: candidates require verification `verified`, while vector retrieval requires `approved`, plus different onboarding/availability checks. Fixing grants alone does not prove complete matching correctness.

### P0: booking schema and state-machine gaps

The deployed `create_marketplace_booking_request` writes `actor_profile_id` and `metadata` into `marketplace_booking_events`. Current catalog columns are `actor_type`, `actor_id`, `event_data` (alongside booking_id/event_type). This is a directly observed runtime/schema mismatch, not a hypothetical missing feature. PR #48 contains PR #44 and candidate fixes, durable claims, reschedule authorization and database tests. These are not deployed to production.

The PR #48 latest-head application CI actually failed at the source-secret scanner on a server-side local-fixture environment lookup. Its separate database rehearsal succeeded. Earlier green CI for `4002877` must not be described as a pass for latest `0af7e6a`. A local continuation now corrects this narrow false positive, retains rejection of literal assignments/client exposure, and expands the scheduling CI command; release gates remain HOLD.

### P0: payment/credit lifecycle is not uniformly deployed

PR #42 implements durable signed-event acknowledgment/quarantine, exact paid identity, entitlement and replay guards, cancellation/replacement safeguards, refunds/adjustment policies and credit settlement. It is still draft and conflicts with current main in package files and subscription source tests. Current TEST credit reservation hash `b9c0ffb6432e9f9da7d8010845df0e77` includes execution binding and paid-access guards. Production's retrieved definition lacks those newer guards. Do not replace test claim/settle with production finalize code.

A 6 November owner-approved TEST payment, webhook HTTP 200 and renewal stop are documented on the billing branch. This is historical test evidence, not a new transaction or production acceptance. Current read-only checks show zero enabled TEST billing configuration rows and zero enabled refund configuration rows. Production does not have the same release-configuration tables in the inspected catalog; do not describe test gates as universal production protection. W08/W10/W12/W16 and checkout-owner browser acceptance remain open.

### P0: dependency and authorization review

The locked main dependency scan reports Next.js 16.4.0 affected by critical advisories GHSA-2464-fhr4-w9xw and GHSA-673q-mjm6-r5xr, plus GHSA-p3m5-59mp-jv5r. These are package applicability findings; exploitation was not attempted or established. A development-only exact update to 16.4.6 builds successfully and removes critical/high findings in the new lockfile. Seven moderate Sentry/transitive findings remain and need separate upgrade review. Production still runs the prior frontend.

All 243 public base tables inspected have RLS enabled. This does not prove least privilege. Policies on `career_profile_versions`, `career_profile_comparisons`, `career_profile_quality_runs` and `document_processing_jobs` permit coach-wide SELECT without an assignment predicate; authenticated SELECT grants are present. If coach access is intended to be limited to assigned clients, these policies violate that intended boundary. No unrelated customer rows were queried to demonstrate exposure. Confirm intended scope and test two synthetic coaches/clients before pilot.

## AI architecture reconciliation

Live registry: 23 active rows, all status `testing`; 16 owned by `client_coach`, six staff and one admin. Active does not mean certified or customer-visible. Five modes are works_without_ai, six ai_optional and twelve ai_required. The feature matrix lists the exact agents.

Deployed runtime v25 already contains deterministic/structured fallbacks and direct OpenAI Responses calls. Non-AI modes skip paid credit reservation. Optional modes can use structured baselines; required modes preserve context and block when inference is unavailable. Runtime code also includes subscription checks, configuration snapshots, credit reservation/finalization, usage records and human-review paths. These implementations were inspected, not executed with customer data.

Groq, AI SDK, Gateway and Exa/Tavily modules in main are isolated pilot tooling. They are not imported into production agent execution. Gateway needs an independently approved bounded key/test; no paid call was made. Groq cannot be treated as a drop-in replacement for OpenAI web-search-plus-structured-output capability. No LiteLLM, Cloudflare AI Gateway or new infrastructure was introduced.

PR #39 is a separate 11-agent reduced-dependency cutover; nine provider-dependent pipelines are paused in test. Production has not received that cutover. Its old description of missing TEST Paystack setup/empty test schema is superseded by later billing work and today's 25-migration populated test environment. Preserve its fallback architecture, but reconcile its conflicting webhook/runtime against #42 before any integration.

## Other platform evidence

- Public content, account entry points, pricing, blog articles, legal pages, sitemap and metadata exist. Prior browser checks verified plan display and help accordions; this does not validate checkout or account creation.
- Client/coach server dashboard access checks use identity plus `get_my_role`; #40 sidebar is merged. #46 site-header logout is merged; #47 dashboard-specific logout is still draft. Do not report these as the same feature.
- Registration, email callback, profile/service/document flows, admin governance, payout and support code exist. Authenticated customer journeys remain blocked on approved synthetic sessions, not classified as absent.
- Client documents and coach-credential buckets are private; avatar and career-insight buckets public. Ownership/assignment policies exist on key evidence/document tables. Full cross-user browser/API/storage acceptance remains outstanding.
- Four non-invoker governance/usage views have no anon/authenticated SELECT grant in the inspected ACLs; default-view behavior alone is not a proven exposure.
- Production advisors: 1 anon and 52 authenticated callable SECURITY DEFINER warnings, leaked-password protection disabled, 16 RLS-no-policy informational notices. Test: 9 anon/44 authenticated warnings, 4 mutable search paths, 2 public extensions, leaked-password warning. Review function bodies/grants rather than blindly revoke every function. Deny-all tables may intentionally have no policies.
- Production health advisors returned no lints. Vercel production error aggregation returned no groups in the available 30-minute window; the first 1-hour query was retention-rejected. Absence of recent groups is not long-term monitoring proof. Supabase logs are present; no private messages/documents were exported.
- Sentry instrumentation is in source, but alert delivery/DSN wiring was not verified. Brevo pilot opt-in/contact/email code and production environment name exist; both connected guide and account reads failed with MCP internal errors. No email/contact mutation occurred.
- Backup/PITR configuration, restore rehearsal, production secret inventory, Calendly provider plan/scopes and webhook configuration, live Paystack settings, provider billing, mobile/device acceptance and measured performance remain unverified.

## Safe work completed locally

Audit branch: `audit/careerdevglobal-reconciliation-2026-11-16` based on verified main. Help search now filters questions/answers with explicit no-match feedback, retains server metadata, and exposes a result status. The shared skip link targets a focusable page-content wrapper; browser keyboard check reaches the help input after skipping navigation. Next.js is pinned to 16.4.6 with a generated lockfile. No pricing, credits, refunds, gates or live configuration changed.

PR #48 continuation: `audit/calendly-source-audit-2026-11-16` based on exact remote head, in a separate worktree (local commit `65e388f`). Only the exact fixture environment lookup is exempted from the scanner, not literals or arbitrary test files. Regression tests prove those rejection boundaries. Public directory failures now render a distinct unavailable state instead of falsely reporting no inventory; successful empty results remain distinct. Four HTTP-boundary regression tests cover denied requests, transport/shape failures and successful data. No production SQL was applied. Synthetic PostgreSQL 16 ran with no network, ephemeral storage and a read-only repository mount; it was stopped afterward. This is a partial contract fixture, not a reconstructed production schema or real Calendly acceptance.

See [acceptance matrix](end-to-end-acceptance-matrix.md), [PR reconciliation](open-pr-reconciliation.md), [critical path](critical-path-and-priorities.md) and [release gates](production-release-gates.md). Nothing was merged, remotely pushed, deployed or promoted. Reports and fixes are local tracked development work; the complete definition of launch success remains blocked by the listed missing evidence.
