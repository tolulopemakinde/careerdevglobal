# Pull request reconciliation — 16 November 2026

All PR states/heads were read from GitHub; remote refs were cloned and compared with main `8ca79c0`. The inspected PR collection has no PR newer than #48. CI outcomes are retrieved run records, not inferred from a READY preview or PR narrative. Empty exact-head run results are evidence gaps, not failed tests.

Local `git merge-tree --write-tree origin/main origin/<branch>` detected the textual conflicts below without merging any branch. A clean textual merge does not prove semantic compatibility. #34 → #35 → #36 and #44 → #48 ancestry were checked directly. PR #39 is not an ancestor of #42.

## PR #10: Add baseline security response headers

- **Status:** open / draft; head `912e09c731bc067af114bdce38a6fbe732a27557`; branch `security/baseline-response-headers`.
- **Implementation:** Baseline nosniff/referrer/anti-framing headers.
- **Production:** No verified production inclusion; #39/#42 have separate TEST deployments only. Backend version parity must be checked separately.
- **Evidence:** No exact-head Actions runs returned; old PR requires current build/preview regression.
- **Conflicts/dependencies:** next.config.ts conflict; preserve current redirects and Sentry wrapper.
- **Decision / release evidence required:** Revise/rebase existing PR; no production headers change until auth/Calendly/PWA/Sentry acceptance.
- **Source:** https://github.com/tolulopemakinde/careerdevglobal/pull/10

## PR #29: docs: security remediation plan and release gates

- **Status:** open / draft; head `e866828aa4d4e29e584917fdb7b42c9451cc3e82`; branch `audit/security-remediation-2026-10-23`.
- **Implementation:** Read-only security findings, remediation gates, deployed-function snapshots.
- **Production:** No verified production inclusion; #39/#42 have separate TEST deployments only. Backend version parity must be checked separately.
- **Evidence:** Exact-head run 39997452584 FAILED; no new claim of green CI.
- **Conflicts/dependencies:** No textual main conflict; historical findings must be refreshed against current catalogs.
- **Decision / release evidence required:** Update evidence with this audit; supersede stale findings rather than treat docs as remediation.
- **Source:** https://github.com/tolulopemakinde/careerdevglobal/pull/29

## PR #34: Add adaptive intake for LinkedIn Optimization Agent

- **Status:** open; head `14946203c442caaf599455c49d00d10a8835ab2e`; branch `feature/linkedin-optimization-adaptive-intake`.
- **Implementation:** LinkedIn-specific optional adaptive intake fields and request context.
- **Production:** No verified production inclusion; #39/#42 have separate TEST deployments only. Backend version parity must be checked separately.
- **Evidence:** Exact-head run 40492379336 SUCCESS; positive authenticated persistence not run.
- **Conflicts/dependencies:** scripts/audit-source-config.mjs conflict; ancestor of #35 and #36.
- **Decision / release evidence required:** Retain contribution through #35/#36; avoid a separate duplicate integration.
- **Source:** https://github.com/tolulopemakinde/careerdevglobal/pull/34

## PR #35: Draft: restore intake engine source and add document evidence retrieval

- **Status:** open / draft; head `83704ac37c453731a27cb35f1e6c0dc4ad361827`; branch `fix/linkedin-intake-document-evidence`.
- **Implementation:** Recovered intake runtime; pre-read authorization; request-scoped document evidence; checked status/persistence.
- **Production:** No verified production inclusion; #39/#42 have separate TEST deployments only. Backend version parity must be checked separately.
- **Evidence:** Exact-head LinkedIn run 40519139383 SUCCESS; 18 tests documented; authenticated integration open.
- **Conflicts/dependencies:** package.json and scanner conflicts; includes #34 and is included by #36.
- **Decision / release evidence required:** Continue isolated intake tests after schema reconciliation; do not replace runtime with incompatible pilot.
- **Source:** https://github.com/tolulopemakinde/careerdevglobal/pull/35

## PR #36: Draft: establish Supabase schema source-of-truth recovery

- **Status:** open / draft; head `97f25b16882423e3d076e5da1685be471f1d144e`; branch `chore/supabase-authoritative-baseline`.
- **Implementation:** Schema recovery docs and catalog inventory SQL; contains #34/#35 work.
- **Production:** No verified production inclusion; #39/#42 have separate TEST deployments only. Backend version parity must be checked separately.
- **Evidence:** No exact-head Actions runs returned; metadata query evidence documented historically.
- **Conflicts/dependencies:** package.json and scanner conflicts; historical empty-test statement now stale.
- **Decision / release evidence required:** Continue provenance recovery first; separate/reconcile inherited runtime changes from schema-only recovery.
- **Source:** https://github.com/tolulopemakinde/careerdevglobal/pull/36

## PR #39: Draft: structured-only no-OpenAI pilot runtime, pricing and billing safeguards

- **Status:** open / draft; head `4ad6a7cc5a7e714e90c06c826cd24324fea9d9f5`; branch `pilot-no-openai-pricing-2026`.
- **Implementation:** 11-agent structured/no-OpenAI pilot; 9 dependent pipeline pause handlers; preserved review/fallbacks.
- **Production:** No verified production inclusion; #39/#42 have separate TEST deployments only. Backend version parity must be checked separately.
- **Evidence:** Exact-head 40620604306 SUCCESS; 29 local and 45 HTTP boundary tests documented; 11-agent positive E2E open.
- **Conflicts/dependencies:** add/add webhook conflict with main; overlaps #42 runtime, pricing, credits; not ancestor of #42.
- **Decision / release evidence required:** Revise after #42 contracts; preserve reduced-dependency architecture, no cutover before pilot acceptance.
- **Source:** https://github.com/tolulopemakinde/careerdevglobal/pull/39

## PR #40: Add responsive sidebar navigation to client and coach dashboards

- **Status:** merged; head `d2eb4fa89cf048e97404cc4092d74a259f60464e`; branch `feat/responsive-dashboard-sidebar`.
- **Implementation:** Role-specific responsive sidebars and server dashboard access wrapper.
- **Production:** Yes, merged frontend source. Backend version parity must be checked separately.
- **Evidence:** Exact-head 40654129503 SUCCESS; remaining authenticated viewport/session QA.
- **Conflicts/dependencies:** Merged; source is present in main and verified production frontend.
- **Decision / release evidence required:** Continue QA only; do not rebuild sidebar.
- **Source:** https://github.com/tolulopemakinde/careerdevglobal/pull/40

## PR #42: Harden gated AI billing lifecycle and durable webhook acknowledgments

- **Status:** open / draft; head `4513c87f5efcb399871cb78ccd663243f2f218e1`; branch `fix/ai-billing-lifecycle-safety-2026-11`.
- **Implementation:** Billing receipt, entitlement, credit, webhook quarantine/acknowledgment, replacement and adjustment safeguards.
- **Production:** No verified production inclusion; #39/#42 have separate TEST deployments only. Backend version parity must be checked separately.
- **Evidence:** Exact-head billing run 42144651135 SUCCESS; 144 local tests re-passed; local verify/build passed; historical matched TEST result only.
- **Conflicts/dependencies:** Actual main merge-tree conflicts in package.json, package-lock.json, tests/ai-subscription-source.test.mjs; overlaps #39 and scheduling payment flow.
- **Decision / release evidence required:** Continue existing branch; reconcile current security patch and cancellation tests; keep draft and gates disabled.
- **Source:** https://github.com/tolulopemakinde/careerdevglobal/pull/42

## PR #43: Draft: guarded OpenAI/Groq pilot and Exa/Tavily evaluation (no LiteLLM)

- **Status:** merged; head `d9ed44730738d0f7362979536228bf3fb88fbe26`; branch `design-groq-research-gateway-2026-11-04`.
- **Implementation:** OpenAI/Groq SDK synthetic adapters, research normalizers and Gateway-funded evaluation.
- **Production:** Yes, merged frontend source. Backend version parity must be checked separately.
- **Evidence:** Main run 42153732953 SUCCESS; dormant local AI suite re-passed; no paid requests.
- **Conflicts/dependencies:** Merged/dormant implementation on main via 8ca79c0; frontend production matches main.
- **Decision / release evidence required:** Retain dormant tools; production fallback routing remains HOLD; not a pending production integration.
- **Source:** https://github.com/tolulopemakinde/careerdevglobal/pull/43

## PR #44: [Draft] Calendly scheduling reliability — frontend safeguards and backend remediation plan

- **Status:** open / draft; head `e91f995093e5544b176a45f9f6b8c8d15ea51250`; branch `codex/calendly-scheduling-reliability-2026-11-04`.
- **Implementation:** Frontend scheduling validation, timezone handling, safe failure UX and remediation proposals.
- **Production:** No verified production inclusion; #39/#42 have separate TEST deployments only. Backend version parity must be checked separately.
- **Evidence:** Exact-head Phase 1 run 41842494239 SUCCESS; historical local EPERM statement is not current CI failure.
- **Conflicts/dependencies:** Clean textual main merge; ancestor of #48; overlaps profile/dashboard/service files.
- **Decision / release evidence required:** Continue through #48 integration line; do not merge both independently.
- **Source:** https://github.com/tolulopemakinde/careerdevglobal/pull/44

## PR #47: Add Log out to Client and Coach dashboard sidebar menus

- **Status:** open / draft; head `e188410b021ffc2c21cea47385525108cb6b8ec6`; branch `fix/dashboard-sidebar-logout-2026-11-04`.
- **Implementation:** Client/coach DashboardShell logout, busy/error handling and role-login redirect.
- **Production:** No verified production inclusion; #39/#42 have separate TEST deployments only. Backend version parity must be checked separately.
- **Evidence:** Exact-head Phase 1 run 41852180703 SUCCESS; READY preview; signed-in browser acceptance open.
- **Conflicts/dependencies:** Clean textual main merge; source independent of header logout #46.
- **Decision / release evidence required:** Candidate for early merge only after approved synthetic role/session/mobile QA and separate authorization.
- **Source:** https://github.com/tolulopemakinde/careerdevglobal/pull/47

## PR #48: Rehearse durable Calendly bookings and client rescheduling

- **Status:** open / draft; head `0af7e6ac483a66c68b63e084f036c94ec1ecd29a`; branch `codex/calendly-backend-remediation-2026-11-04`.
- **Implementation:** Contains #44; durable provider claims, reconciliation, hosted reschedule authorization and transaction retention.
- **Production:** No verified production inclusion; #39/#42 have separate TEST deployments only. Backend version parity must be checked separately.
- **Evidence:** Latest 0af7e6a: database 43317641371 SUCCESS, application 43317641399 FAILED scanner; earlier 4002877 both green. Local continuation: 93 scheduling/security tests, verify/build and PostgreSQL16 contract rehearsal passed.
- **Conflicts/dependencies:** Clean textual main merge; candidate SQL is not an authoritative full migration; payment and billing contracts still need joint tests.
- **Decision / release evidence required:** Continue local audit/calendly-source-audit-2026-11-16 fix; keep draft; no provider/production-shaped acceptance claimed.
- **Source:** https://github.com/tolulopemakinde/careerdevglobal/pull/48

## Other merged and open work

#45 corrected cancellation database terminology and tests; #46 added site-header logout. Both are on main; neither closes #42 lifecycle acceptance or #47 dashboard logout. #3 PWA and earlier observability/branding work are already integrated. #1 is closed unmerged, with its description recording Sentry as superseded by main. Newer-than-#48 work was not returned by the all-state collection.

### Full PR collection snapshot

| PR | Title | State | Head |
| --- | --- | --- | --- |
| #48 | Rehearse durable Calendly bookings and client rescheduling | open draft | `0af7e6ac483a` |
| #47 | Add Log out to Client and Coach dashboard sidebar menus | open draft | `e188410b021f` |
| #46 | Add Log out to main navigation for signed-in users | merged | `a022b8d79700` |
| #45 | Fix/subscription cancellation tests | merged | `48495791fefe` |
| #44 | [Draft] Calendly scheduling reliability — frontend safeguards and backend remediation plan | open draft | `e91f995093e5` |
| #43 | Draft: guarded OpenAI/Groq pilot and Exa/Tavily evaluation (no LiteLLM) | merged | `d9ed44730738` |
| #42 | Harden gated AI billing lifecycle and durable webhook acknowledgments | open draft | `4513c87f5efc` |
| #41 | Draft: self-service AI subscription management | merged | `7d3df83ba4bb` |
| #40 | Add responsive sidebar navigation to client and coach dashboards | merged | `d2eb4fa89cf0` |
| #39 | Draft: structured-only no-OpenAI pilot runtime, pricing and billing safeguards | open draft | `4ad6a7cc5a7e` |
| #38 | Security: Calendly marketplace booking hardening (review in progress) | merged | `19915f3626a6` |
| #37 | Add direct Calendly booking link fallback | merged | `90f8cfa550d3` |
| #36 | Draft: establish Supabase schema source-of-truth recovery | open draft | `97f25b168824` |
| #35 | Draft: restore intake engine source and add document evidence retrieval | open draft | `83704ac37c45` |
| #34 | Add adaptive intake for LinkedIn Optimization Agent | open | `14946203c442` |
| #33 | Place framework arrows between stage boxes | merged | `aa3cb313397c` |
| #32 | Reduce homepage tagline font size by 2px | merged | `8be393197430` |
| #31 | Reduce homepage tagline font size by 2px | closed | `1b7d27f0a07d` |
| #30 | Reduce homepage tagline font size by 2px | merged | `e868e1fc0e75` |
| #29 | docs: security remediation plan and release gates | open draft | `e866828aa4d4` |
| #28 | Refine homepage framework card width | merged | `0ab6c49aea01` |
| #27 | Widen homepage framework card for single-line journey | merged | `e3b4ac359024` |
| #26 | Match homepage framework card to CI glass panel | merged | `1f644986b684` |
| #25 | Extend premium scroll and touch motion across the website | merged | `840650ebc0db` |
| #24 | Animate Career Intelligence cards on scroll and touch | merged | `8a80dd274ad1` |
| #23 | Add premium motion across CareerDev Global experiences | merged | `6b37f8dc69c4` |
| #22 | Fix legacy routes and canonical site links | merged | `173fb6753bd2` |
| #21 | Fix broken blog service and coach CTA links | merged | `3af460506d32` |
| #20 | Fix AI governance feedback visibility and persistence | open draft | `155315b2d6c0` |
| #18 | Build CareerDev Global sales and revenue growth system | open draft | `5e2a9f10f32a` |
| #17 | fix: use allowed Edge Function secret name | merged | `c4cd3028a899` |
| #16 | Fix production coach-matching control defaults | merged | `76cafaf7d6b0` |
| #15 | Phase 4: add preview validation and operational readiness | merged | `427d92611fea` |
| #14 | Phase 3: prepare distributed AI quotas and rate limits | merged | `367554886d7d` |
| #13 | Phase 2: add preview-ready Edge Function security adapter | merged | `11ab6b127f01` |
| #12 | Phase 1: establish AI safety and reliability foundation | merged | `77b2ae584aff` |
| #10 | Add baseline security response headers | open draft | `912e09c731bc` |
| #9 | fix: use supplied symbol PNG for WhatsApp previews | merged | `ee1a64bbe122` |
| #8 | fix: use PNG Open Graph image for WhatsApp previews | merged | `1d6c9a543b26` |
| #7 | feat: add symbol logo to SEO structured metadata | merged | `70f8b27f1882` |
| #6 | feat: add social sharing metadata with symbol logo | merged | `ee1aba1565e7` |
| #5 | feat: use symbol-only logo for favicon metadata | merged | `a5a1f1f7fc0a` |
| #4 | feat: add official logo to PWA install prompt | merged | `706208a302b8` |
| #3 | feat: add CareerDev Global mobile PWA and smart install experience | merged | `007638fc21d6` |
| #2 | Apply official CareerDev Global logo responsively | merged | `9fdf588a597e` |
| #1 | Add CareerDev Global Sentry observability | closed | `40ea1cf85ede` |

## Integration sequence

1. Establish authoritative schema/RPC contracts (#36), including currently applied version mappings. Record the existing baseline without reapplying historical SQL.
2. Continue #48 (which contains #44) for public projections, booking event compatibility, provider claims and rescheduling. Complete the narrowly scoped local scanner correction, then obtain exact-commit CI and sandbox acceptance.
3. Continue #42 against the same schema and scheduling transaction contract. Preserve #45 corrections, use the reviewed dependency patch, resolve package/test conflicts manually, and complete the remaining TEST/browser cases.
4. Validate #47 independently; it may be reviewed earlier because it does not depend on payments, but its acceptance/authorization gate still applies.
5. Reconcile #35/#34 intake recovery with #39 pilot runtime and #42 credit contracts. Do not choose an entire branch just because it has the largest diff.
6. Refresh #29; rework #10 over current config. Do not close/supersede remote PRs without an explicit review decision. No remote PR state changed in this audit.
