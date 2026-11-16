# End-to-end acceptance matrix

See the [published Phase 1 review status](phase1-published-review-status.md) for verified final PR checks, current mergeability and the scope of the local Supabase Auth result.

## Phase 1 evidence update — 16 November 2026

**Phase 1: PARTIAL / HOLD; production release remains HOLD.** The continuation of [PR #36](https://github.com/tolulopemakinde/careerdevglobal/pull/36) contains the full evidence and recovery runbook (`docs/database/phase1/`). All 229 historical migration bodies were recovered from the production ledger; one bootstrap identity is explicitly redacted, with provenance hashes retained. The earlier assumption that historical SQL bodies were unavailable is superseded. Application catalog reconstruction and synthetic backup/restore comparisons pass; this is not a native production dump or real managed Auth/Storage parity.

The selected Supabase organization is Free with two active projects and no eligible additional free slot. A generic $0 quote did not establish capacity: project creation was rejected before provisioning. No paid resources, upgrades or add-ons were created, and no complete paid quote was available. Full local Supabase image extraction exceeded the 8 GB workspace disk. A smaller network-disabled PostgreSQL 17 fixture works with six synthetic identity adapters, not working Auth login accounts.

Baseline role checks: **9/17 pass**. Local candidate and restored checks: **16/17 pass**. Anonymous directory grants, vector status/operator resolution and assigned-coach isolation are corrected only in local candidates. The remaining failure is authenticated coach profile editing through `mark_coach_semantic_profile_stale()`; a narrow invalidation/approval-integrity design is still required. Existing #48 booking SQL was exercised against the restored full application schema: original fails on event columns, candidate returns `requested`, with booking transactions rolled back.

Fresh isolated checks: **7 database regression tests, 96 scheduling/security/directory/matching-boundary tests and 144 billing tests pass**. Current-phase frontend validation also passed 4 Help Center and 139 AI tests plus typecheck/source checks before dependency-cache cleanup; prior build/browser evidence remains bounded. Deno/provider compilation and real authenticated/provider acceptance are pending. Calendly is Basic/free with one structurally suitable event type, but sandbox designation, app callback and sufficient OAuth scopes are unverified. Paystack remaining lifecycle/refund cases require isolated TEST readiness and explicit financial scope; no new payment or provider mutation was performed.

Next: fix coach invalidation safely; obtain sufficient local disk for real Supabase services or an exact owner-approved cloud quote; create genuine synthetic logins; compile/test matching; complete Calendly and approved Paystack TEST acceptance; reconcile PR ancestry/conflicts and exact-head CI. Production and populated AI test remain unchanged. Passing catalog CI cannot satisfy release gates.

## Original audit baseline (superseded where noted above)

Baseline: 16 November 2026. PASS is always scoped to its stated environment and boundary. PARTIAL is not launch acceptance. BLOCKED means approved sessions/configuration or representative schema is missing. FAIL is an observed incompatibility. No production account was created, no customer document read/uploaded and no payment/provider mutation performed.

| ID / workflow | Expected behavior | Actual evidence / status | Source/environment | Automated/manual evidence | Remaining action / release gate |
| --- | --- | --- | --- | --- | --- |
| A01 visitor → client registration | Terms-aware registration, verification, active profile | PARTIAL: forms/callback implemented; full registration BLOCKED | Main + public | Source review, public HTTP | Approved synthetic signup + verification and recovery, G03 |
| A02 client profile → assessment | Save/reload owned profile; deterministic assessment persists | PARTIAL: owner RLS and runtime fallback present | Production catalog/v25 | Read-only definitions | Positive authenticated save/reload and no-credit path, G03/G06 |
| A03 profile → AI recommendation | Grounded output, correct plan/credits, no unsupported claims | PARTIAL: direct OpenAI and structured fallbacks present; live inference BLOCKED | v25 / dormant pilot tooling | Local synthetic AI suite PASS | Approved test provider scope; quality/credit/review E2E, G06/G07 |
| A04 client → coach discovery | Eligible approved coaches/services shown publicly | FAIL: eligible owner count 1/2; anonymous RPC HTTP401 SQL42501 | Production read-only | Actual HTTP + catalog grants | #48 projection/grants in disposable target, G02 |
| A05 matching goal → recommendations | Return eligible explainable matches or genuine no-match | FAIL: prior browser unavailable, anon RPC grants denied; eligibility drift | Production v17/catalog | Browser + source/ACL review | Fix/validate limiter, grants and predicates together, G02/G04 |
| A06 coach application → approved profile | Review restricted to staff/admin; published fields safe | PARTIAL: one approved record, workflows present; acceptance BLOCKED | Production source/catalog | Aggregate inventory, RPC presence | Synthetic qualification/approval and unauthorized-role checks, G03 |
| A07 approved coach → offerings/availability | Owned offerings, valid times/timezone, controlled publication | PARTIAL: 2 active offerings/1 Calendly connection; writes not tested | Production aggregate | Read-only counts | Synthetic availability/profile/publishing and invalid times, G04 |
| A08 client → booking request | Owned request and correct event audit persist atomically | FAIL: deployed RPC writes nonexistent event columns | Production definition/catalog | Direct source/schema comparison | #48 candidate + full schema rehearsal, G01/G04 |
| A09 booking → confirm/service delivery | Single provider appointment, durable claim/meeting/audit/payment | PARTIAL: contract tests PASS; provider acceptance BLOCKED | #48 continuation, local PG16 | 93 scheduling/security tests; DB rehearsal | Genuine TEST provider response, role browser, delivery/reconciliation, G04/G05 |
| A10 reschedule/cancel | Hosted authorized move; no overlap; current meeting; same transaction | PARTIAL: HTTP/operation and SQL contract tests PASS; real provider BLOCKED | #48 continuation local mocks/PG16 | Overlap rollback, concurrent replay, unauthorized roles, transaction identity | Multiple moves, webhook recovery, replacement meetings, sandbox browser, G04 |
| A11 subscription purchase → access | Exact TEST payment, durable signed event, correct owner/period/credits | PARTIAL historical provider/backend PASS; owner browser BLOCKED | #42 TEST 6 Nov; current local code | Matched result doc, current 144 tests PASS | Checkout-owner callback, entitlement display and isolation, G05 |
| A12 upgrade/replacement | No overlapping paid subscriptions; correct interval/credits | PARTIAL local tests; provider/browser BLOCKED | #42 | 144 tests + historical rollback cases | W16 separately approved natural eligibility/TEST sequence, G05 |
| A13 cancel/renew/expire | Paid-through preserved; stop future renewals; expiry denies access | PARTIAL historical renewal-stop PASS; expiry/renewal variants BLOCKED | #42 TEST history | W11 documented; W08/W10/W12 remain open | Provider-controlled events and real expired session, G05 |
| A14 refund/chargeback | Idempotent adjustment; correct credit/payout reversal and audit | BLOCKED policies/gates; isolated tests only | #42 local and TEST gate metadata | New local 144 tests PASS; gates zero enabled | Policy decision + adjudicated TEST scenarios, G05 |
| A15 credit funding/usage | Correct reserve/claim/settle and release on failure; no replay abuse | PARTIAL: TEST bindings/payment guard true; production differs | Production vs TEST definitions | TEST MD5 checked, #42 local suite | Full credit/provider failure/concurrency/reconciliation in representative schema, G05/G06 |
| A16 admin/governance/cross-role | Only authorized staff/admin; coaches limited to intended assignments | REVIEW REQUIRED: broad coach SELECT policies with auth grants | Production catalog only | Policy/ACL review; no unrelated data queried | Confirm policy, synthetic two-client/two-coach negative tests, G03 |
| A17 document upload → extraction → intake | Supported formats, size limits, owned evidence, no cross-user reads | PARTIAL: ingestion/processing functions exist; #35 protections candidate | Production versions / #35 source | #35 CI 18 tests historical PASS | Format, persistence/failure, storage and request isolation, G03/G06 |
| A18 dashboard logout | Revoke session, clear private UI, return to correct role login | PARTIAL: header merged; #47 dashboard candidate | Main vs #47 preview | #47 CI PASS | Approved client/coach and expired-session browser, G03 |
| A19 help search | Filter questions/answers, count/no-match/reset feedback | PASS LOCAL: refund→0, delete→1, unrelated groups removed | Audit branch / local Next16.4.6 | 4 regression tests + Chrome manual | Publish only through authorized release; responsive QA, G08 |
| A20 keyboard skip | First Tab exposes skip, Enter/Tab reaches content | PASS LOCAL: fragment main-content, next focus help input | Audit branch / local Chrome | Manual keyboard sequence | Other route/device checks, G08 |
| A21 security patch | Known critical dependency findings resolved without regression | PASS LOCAL: Next16.4.6, verify/build, no high/critical audit findings | Audit branch lockfile | npm audit, TypeScript, boundary/build checks | Moderate dependency review + exact-release CI, G08 |
| A22 monitoring/recovery | Error alert reaches operator; known rollback and restore | BLOCKED: Sentry delivery/PITR/restore evidence absent | Source + Vercel 30m logs | No recent error groups; health no lints | Test alert and restore/rollback rehearsal, G09 |

## Local verification ledger

- Audit branch: locked npm install (cache under /tmp; initial default-cache install failed), verify:phase4, test:ai-pilot, 4 help regression tests, optimized Next16.4.6 build, whitespace review. The AI suite is synthetic; no inference calls.
- PR #48 continuation: scanner reproduced failing before correction; 2 targeted scanner tests and combined 93 scheduling/security tests pass; verify:phase4 and build pass. PostgreSQL16 contract rehearsal passes in network-disabled ephemeral Docker; it is not full Supabase/provider acceptance.
- PR #42 exact head `4513c87`: 144 local billing tests, verify:phase4 and optimized build pass. No new transaction or gate change.
- Prior CI main and selected branch results are linked in the PR report/evidence JSON. The #48 latest application CI remains failed remotely until a reviewed correction is published and run.
- Mobile/tablet, assistive technology, measured Lighthouse/Core Web Vitals and authenticated production-shaped browser journeys remain NOT RUN, not passed by desktop screenshots or unit tests.

Directory failure-path browser acceptance also passed locally on port 3101 with a deliberately invalid Supabase target: both coach and service pages render unavailable, not zero inventory. This does not validate a successful directory response or production recovery. Local scheduling continuation commit: `65e388f`.

## Updated Phase 1 acceptance boundary

| Journey | Current evidence | Remaining gate |
| --- | --- | --- |
| Database recovery | Recovered 229 SQL bodies; application reconstruction and synthetic restore pass | Native schema export and managed-service recovery parity |
| Synthetic accounts | Six database identities with representative roles/statuses | Genuine Supabase Auth sessions and browser tests |
| Directory/matching | Approved-only public directory and restricted vector candidates pass local SQL cases | Deno, embeddings and browser acceptance |
| Cross-account restrictions | Unassigned coaches excluded from four locally corrected policies | Review policy intent and real managed JWT/session tests |
| Coach editing | FAIL: semantic invalidation trigger permissions | Narrow authorization and publication/approval regression |
| Booking request | Existing #48 candidate returns requested on full restored app schema | Provider claims, scheduling lifecycle and payment linkage |
| Billing | 144 isolated tests pass; historical TEST evidence retained | Fresh isolated TEST lifecycle/refund/owner-browser acceptance |

These results do not replace the open end-to-end cases with PASS.
