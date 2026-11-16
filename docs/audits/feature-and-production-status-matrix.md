# Feature and production status matrix

## Continued Phase 1 acceptance — superseding update

The coach semantic invalidation failure is now resolved in a **local-only candidate**: **17/17** SQL acceptance and **22/22** cache/publication checks pass, including after restore. Rollback restores the previous single failure and reapplication passes again. The fix retains invoker execution, uses narrow column privileges and ownership/derived-value RLS, and independently denies coach self-approval/publication and cache forgery.

A repeatable CI local Supabase stack reconstructs the recovered full application schema without helper adapters and passes **33/33 real Auth/PostgREST/Storage checks**, including six synthetic password logins, verified sessions, role/assignment isolation, public approved-only directories, profile invalidation and actual private file access with unrelated-client/anonymous denial. [Evidence](https://github.com/tolulopemakinde/careerdevglobal/actions/runs/43963115523). This supersedes earlier statements that only identity adapters were available. The organization still has no free cloud slot; no paid provisioning was needed.

The #48 continuation passes standalone Deno compilation, three embedding-output boundary tests, all 96 scheduling/security checks and current application build checks. [Deno CI](https://github.com/tolulopemakinde/careerdevglobal/actions/runs/43963502892). Native embedding execution, role browser journeys, actual provider lifecycle and physical Storage recovery remain pending. **Phase 1 remains PARTIAL / production HOLD.** No production/shared-test mutation, financial transaction or production release occurred. The [published status](phase1-published-review-status.md) and [current full report](https://github.com/tolulopemakinde/careerdevglobal/blob/chore/supabase-authoritative-baseline/docs/database/phase1/README.md) carry the scope and next steps.

## Phase 1 evidence update — 16 November 2026

**Phase 1: PARTIAL / HOLD; production release remains HOLD.** The continuation of [PR #36](https://github.com/tolulopemakinde/careerdevglobal/pull/36) contains the full evidence and recovery runbook (`docs/database/phase1/`). All 229 historical migration bodies were recovered from the production ledger; one bootstrap identity is explicitly redacted, with provenance hashes retained. The earlier assumption that historical SQL bodies were unavailable is superseded. Application catalog reconstruction and synthetic backup/restore comparisons pass; this is not a native production dump or real managed Auth/Storage parity.

The selected Supabase organization is Free with two active projects and no eligible additional free slot. A generic $0 quote did not establish capacity: project creation was rejected before provisioning. No paid resources, upgrades or add-ons were created, and no complete paid quote was available. Full local Supabase image extraction exceeded the 8 GB workspace disk. A smaller network-disabled PostgreSQL 17 fixture works with six synthetic identity adapters, not working Auth login accounts.

Baseline role checks: **9/17 pass**. Local candidate and restored checks: **16/17 pass**. Anonymous directory grants, vector status/operator resolution and assigned-coach isolation are corrected only in local candidates. The remaining failure is authenticated coach profile editing through `mark_coach_semantic_profile_stale()`; a narrow invalidation/approval-integrity design is still required. Existing #48 booking SQL was exercised against the restored full application schema: original fails on event columns, candidate returns `requested`, with booking transactions rolled back.

Fresh isolated checks: **7 database regression tests, 96 scheduling/security/directory/matching-boundary tests and 144 billing tests pass**. Current-phase frontend validation also passed 4 Help Center and 139 AI tests plus typecheck/source checks before dependency-cache cleanup; prior build/browser evidence remains bounded. Deno/provider compilation and real authenticated/provider acceptance are pending. Calendly is Basic/free with one structurally suitable event type, but sandbox designation, app callback and sufficient OAuth scopes are unverified. Paystack remaining lifecycle/refund cases require isolated TEST readiness and explicit financial scope; no new payment or provider mutation was performed.

Next: fix coach invalidation safely; obtain sufficient local disk for real Supabase services or an exact owner-approved cloud quote; create genuine synthetic logins; compile/test matching; complete Calendly and approved Paystack TEST acceptance; reconcile PR ancestry/conflicts and exact-head CI. Production and populated AI test remain unchanged. Passing catalog CI cannot satisfy release gates.

## Original audit baseline (superseded where noted above)

Baseline: 16 November 2026. Source SHA `8ca79c0`; production frontend identity verified through Vercel. H = direct current source/catalog/observation; M = implementation or historical evidence without complete current acceptance. Public browser evidence is scoped to the Vercel alias, not the unverified custom domain.

| Capability | Implemented/source | Production/TEST evidence | Current status | Confidence / next gate |
| --- | --- | --- | --- | --- |
| Public homepage, services messaging, pricing, blog/legal/help | Main routes | Public pages and pricing display observed | Available, some defects | H / responsive and performance acceptance |
| Help search | Main input had no handler | Prior live browser unchanged on query; reproduced in source | Broken live; locally fixed | H / deploy only after release review |
| Keyboard skip link | Main targeted nonexistent inner-page `#services` | Source and prior public HTML agree | Broken live; locally fixed and keyboard checked | H / multi-route/mobile QA |
| Client/coach signup | RoleAuth, terms/pilot choices, callback | Supabase Auth code exists | Implemented; E2E unverified | M / approved synthetic signup, verification, recovery |
| Role/session routing | Server DashboardAccess and RPC role lookup | Main | Implemented; full cross-role/expired-session acceptance open | H source / actual session tests |
| Dashboard sidebar | Merged #40 | Main ancestor | Deployed source; authenticated UX unverified | H deployment / mobile keyboard acceptance |
| Header logout | Merged #46 | Main ancestor | Deployed implementation | H source / signed-in session QA |
| Dashboard logout | #47 only | READY preview, CI success | Not in production | H / signed-in role and expired-session QA |
| Coach onboarding/approval | Registration, coach/admin views, RPCs | One approved coach exists | Implemented; approval workflow unverified | H inventory / synthetic review and role restrictions |
| Marketplace coach/service directory | Main + live RPCs | One coach/two eligible services; anon RPC 401/42501 | Confirmed authorization/UI failure | H / narrow public projection and grants rehearsal |
| Matching | Edge v17, local embeddings + retrieval | Both anonymous RPCs denied; eligibility predicates diverge | Broken public path | H boundary / limiter, retrieval, eligibility test |
| Availability/profile/offerings | Main coach panels and live schema | Active offerings/connection exist | Implemented; E2E open | M / scoped publication and slot tests |
| Booking creation | Main + live RPC | Event-column mismatch confirmed | Blocked/faulty boundary | H / #48 production-shaped rehearsal |
| Calendly OAuth | Production v11 | PKCE/state and encrypted-token code; one active connection | Implemented; current scopes/provider acceptance unknown | H source / sandbox OAuth and refresh |
| Confirmation/cancellation | Production booking v12; #48 candidates | Separate frontend/backend enhancements remain draft | Partial; safe concurrency cutover pending | H source / provider+payment acceptance |
| Rescheduling | #48 Edge handler/UI/candidate SQL | Not in production function list | Implemented candidate, isolated tests pass | H / real hosted sandbox flow, meetings, webhook recovery |
| Paystack checkout/verification | Production checkout v7, verify v4 | Later #42 TEST versions differ | Existing functionality; lifecycle safety not accepted | H versions / matched owner browser, renewals/expiry |
| Durable webhook/entitlement lifecycle | #42 draft | TEST webhook v10; historical genuine TEST payment/stop | Partially accepted in isolated TEST; not production | H metadata, M historical / remaining W cases |
| Refunds/chargebacks/payouts | Main/Edge plus #42 adjustments | TEST refund gate disabled | Policy/reconciliation acceptance blocked | H gate / separate approvals and TEST scenarios |
| AI credits | Production reserve/finalize; #42 claim/settle | Different function guards/contracts | Implemented; production parity unresolved | H / replay, ownership, concurrency and paid interval |
| Career profile persistence | Main/schema/RLS | Tables/RPCs and profile owner checks exist | Implemented; signed-in positive E2E open | H source / save, reload, cross-user isolation |
| Document ingestion/extraction | Multiple production Edge functions | Live versions listed in evidence JSON | Implemented; isolated positive and failure QA open | H presence / formats, limits, storage ownership |
| LinkedIn adaptive intake | #34 included by #35 and #36 | Not on main; #35 CI passed | Candidate; live authenticated acceptance pending | H / don't merge three overlapping branches separately |
| Human-review/service delivery | Admin/coach workflows, snapshots/quality records | Production runtime has review paths | Implemented paths; bypass/approval E2E unverified | H source / role and consequential-use tests |
| Admin governance/users/payouts/analytics | Main routes, privileged RPCs, audit tables | Source and live schema | Implemented; least-privilege acceptance open | H source / coach-wide policies and RPC body review |
| PWA | Merged manifest/service-worker/install code | Main | Implemented; device/offline/update acceptance pending | M / phone/browser matrix |
| Sentry | Main instrumentation | Delivery/DSN not verified | Wiring present; operational acceptance unknown | M / synthetic error-to-alert test |
| Brevo | Pilot opt-in API + env name | MCP guide/account reads errored | Integration implemented; delivery unverified | M / restore read access, approved mail test |
| SEO | Metadata, sitemap, robots | Public output exists | Foundation present | H / intended domain and canonical audit |
| Security headers | #10 draft; main has no baseline header block | Earlier public headers lacked them | Not deployed; config conflict | H / preserve redirects/Sentry and test integrations |
| Next.js security patch | Local audit branch 16.4.6 | Production 16.4.0 source | Fixed candidate only | H / reviewed rollout and remaining moderate findings |

## Actual live AI registry

All 23 active rows are `testing`; no claim of certification follows. Customer workspace queries `owner_role=client_coach`, which gives 16; seven are staff/admin. These facts do not prove subscription access or output quality. The live v25 runtime already implements fallbacks; the separate #39 eleven-agent pilot is not the deployed production cutover.

| Mode | Exact live agents | What the mode establishes |
| --- | --- | --- |
| works_without_ai (5) | career_assessment_agent; ethics_quality_assurance_agent; learning_development_agent; skills_gaps_agent; talent_mobility_agent | Deterministic/structured path exists; full positive acceptance still open |
| ai_optional (6) | academic_career_transition_agent; career_coach_agent; career_discovery_agent; career_research_agent; employer_talent_agent; job_search_intelligence_agent | Structured baseline/fallback can preserve context; not live-research proof |
| ai_required (12) | career_discovery_ai; ceo_operations_ai; cover_letter_agent; cv_linkedin_ai; cv_resume_agent; interview_coach_agent; lead_generation_ai; leadership_coach_agent; linkedin_optimization_agent; marketing_content_ai; research_opportunities_ai; sales_proposal_ai | Full requested capability needs inference; fallback should preserve context and require review/block unsupported claims |

All rows have fallback_enabled true. Registry human_approval_required is false for all rows, while runtime/service-specific checks can still require review; test actual consequential-use gates, not the registry flag alone. Production model configuration is captured per execution and uses OpenAI Direct; no Groq/Gateway production routing was established. AI SDK/OpenAI/Groq packages and synthetic adapters in main are dormant pilot components. Exa/Tavily provider choice/live quality tests remain pending.
