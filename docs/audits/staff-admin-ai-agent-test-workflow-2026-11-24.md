# Staff/Admin AI Agent Testing Audit — 24 November 2026

## Scope and baseline

This review is limited to the seven Staff/Admin agents and their existing Admin test actions:

| Agent | Workflow | Registry owner | Required synthetic inputs | Expected workflow output |
|---|---|---|---|---|
| CEO Operations AI | `executive_performance_review` | Admin | `quality`, `outcomes`, `performance_data` | `risks`, `actions`, `insights` |
| Career Discovery AI | `career_profile_analysis` | Staff | `career_profile`, `service_request` | `career_direction`, `target_roles`, `recommendations`, `gaps` |
| CV & LinkedIn AI | `cv_service_delivery` | Staff | `blueprint`, `documents`, `career_profile`, `service_request` | `cv_draft`, `quality_summary`, `review_required` |
| Lead Generation AI | `lead_qualification` | Staff | `lead`, `service_catalog` | `next_action`, `service_fit`, `qualification` |
| Marketing Content AI | `content_creation` | Staff | `topic`, `audience`, `brand_guidance` | `cta`, `content`, `repurposing` |
| Research & Opportunities AI | `opportunity_research` | Staff | `research_scope`, `target_profile` | `sources`, `deadlines`, `opportunities` |
| Sales Proposal AI | `proposal_generation` | Staff | `lead`, `needs`, `service` | `scope`, `proposal`, `next_steps` |

Repository baseline: `main` at `0b35abc` (`Gate AI subscription checkout by USD availability`), clean before this work. The existing Admin role gate checks for a signed-in user with an active `admin` or `staff` profile. The existing action labelled “Run autonomous functional test” then created a database request, prepared an execution, and called `careerdev-ai-agent-runtime` with the request ID.

## Lead Generation workspace follow-up

The Lead Generation AI card now has a separate **Initiate Lead Generation** action that opens an Admin-only, session-local workspace for the existing `lead_qualification` workflow. Staff/Admin users enter search criteria, open LinkedIn's homepage, paste the copied terms into LinkedIn themselves, and manually enter leads they have reviewed. The workspace does not call a LinkedIn API, scrape or automate LinkedIn, send outreach, persist lead records, or call an AI provider. It presents a human-reviewed lead list and a deterministic report covering fit-review status, contact permission, and duplicate profile URLs. Separate CSV downloads provide the lead list and summary report; CSV cells are escaped and formula-like values are neutralized.

LinkedIn's current User Agreement prohibits scraping and unauthorized automated access and restricts deep links to LinkedIn pages. Accordingly, the workflow opens only the LinkedIn homepage and copies the search terms for user-directed search. Direct LinkedIn API access is not implemented; applicable member/profile APIs require developer approval and are governed by data restrictions. See [LinkedIn User Agreement](https://www.linkedin.com/legal/user-agreement), [Profile API access restrictions](https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/profile-api), and [Getting Access to LinkedIn APIs](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access).

Lead data remains in browser memory and is lost on refresh or navigation. Staff must verify identity, relevance, lawful basis, and consent before outreach or sharing. The agent remains `testing`; these changes do not alter registry status, activation, workflows, database policies, production data, or human approval controls. Validation: local Node tests cover search-term preparation, report counts, CSV escaping/formula safety, and the session-local/no-network boundary. TypeScript validation could not run because dependencies are not installed in this workspace (`tsc: not found`); no package installation or provider call was attempted.

## Marketing Content AI follow-up

The existing Admin Blog Management action creates a `weekly_blog_draft` execution and calls the deployed AI runtime. The page now reads the Marketing Content AI registry state and only exposes live generation when the row is explicitly `active`, has `active=true`, and requires human approval. Missing or unreadable configuration fails closed before any execution request. While the agent is testing, an Admin can run a local synthetic content preview to inspect content, SEO, CTA, source, and review fields; the fixture is not saved or published and makes no provider, runtime, or network call. The existing live draft flow still loads reviewed output into the editor as a draft when the agent is explicitly active; a human must review before saving or publishing.

Validation: local static Node tests assert the Admin-only route, fail-closed registry check ordering, and zero-network synthetic preview. No Groq or other inference was invoked. The production registry migration remains unapplied, and the earlier read-only production audit indicated that the agent row is testing while its operational `active` flag remains true and its human-review flag false; the page-level guard prevents the live Blog action in that state but does not replace backend enforcement. Runtime/server authorization still requires a separate review.

## Read-only production findings

The production Supabase project was inspected with SELECT-only queries on 24 November. No database changes were applied.

- At the initial read-only audit, all seven registry rows had `status = testing`, but also `active = true` and `human_approval_required = false`. The production registry was subsequently corrected; see the verification update below.
- Each of the seven configured workflows is active. The workflow input and output contracts are present and differ by agent; the old Admin action sent a generic payload and generic permissive output schema, so it did not honor these contracts.
- `request_ai_agent_execution` is `SECURITY DEFINER`, executable by `authenticated` but not `anon`, and checks an active profile and `active = true` on the selected agent. It limits Staff/Admin-owned agents to Staff/Admin callers, but does not distinguish an Admin-owned agent from a Staff-owned agent.
- `prepare_ai_agent_execution` checks an active profile and ownership for Client/Coach requests. It snapshots the registry human-review flag, but does not re-check that the agent remains active or testing-only.
- `transition_ai_agent_execution` requires independent approval only when the execution record says human review is required. With the current registry value `false`, the database completion guard does not require that approval for these seven.
- RLS permits active authenticated users in the application roles to read the registry and workflow tables. Execution update policies are restricted to active Staff/Admin profiles. The `SECURITY DEFINER` RPC checks remain the principal request and transition boundaries.
- The seven agents currently have 17 request rows and 14 execution rows. All 17 requests are for Career Discovery AI with `test_governed` as their trigger; 11 requests and 8 executions are nonterminal review/test records. This change does not edit or close those records.
- The deployed runtime is active with JWT verification. Its normal path can call the OpenAI Responses API and reserve/finalize AI credits. The old button used `functional_test`, while the runtime’s explicit Staff/Admin restriction and persisted governed-test path are conditioned on `test_governed`. Therefore the old button was neither a $0 provider mock nor equivalent to the governed Career Discovery test action.

The seven-agent runtime source is deployed in Supabase and is not tracked in this repository. Runtime behavior above was reviewed read-only from the deployed function; it has not been modified or invoked during this task.

## Changes in this branch

- Replaced both seven-agent test entry points on the Admin page, including Career Discovery’s separate governed-test button, with a deterministic local mock harness. It performs no database RPC, Edge Function call, provider call, or network request and persists no result.
- Added distinct synthetic inputs and mock outputs matching each workflow’s stored contract. Each result reports role/owner-role, workflow, testing/inactive state, human-review requirement, result-contract checks, and explicit zero provider calls, zero network calls, zero model tokens, and `$0` estimated cost.
- Enforced Admin-only access for the Admin-owned CEO Operations test; active Staff or Admin may run the Staff-owned mock cases. Client, Coach, inactive Staff, unknown agents, mismatched workflows, enabled operational access, and missing human-review enforcement are blocked in the harness.
- Added a migration that pins the seven registry rows to `testing`, sets `active = false`, and requires human review. It includes a seven-row verification guard. It was later applied to the production project and verified; see below.
- Updated Admin labels and result notes so mock output cannot be mistaken for deployed runtime evidence or a persisted execution log.

## Validation

The branch uses synthetic fixtures and local checks only. No AI provider, API, production runtime, database write, migration, project provisioning, or paid service was used.

- `npm run test:admin-ai-agent-mocks`: **7 passed**, including all seven workflow fixtures, role restrictions, inactive/testing and human-review gates, and a source guard that rejects Supabase/runtime calls in both Admin test handlers.
- `node --check` for the mock module and test file: passed.
- `git diff --check`: passed.
- `npm run audit:source`: failed on an existing detection in the untouched `supabase/functions/careerdev-ai-subscription-checkout/index.ts` file (the checker reports possible service-role-secret exposure). No secret value was printed. This file is outside the requested scope.
- `npm run typecheck`: unavailable because dependencies are not installed in this checkout (`tsc` is not present). Dependencies were not installed.

Live database/RPC authorization, runtime behavior, external provider quality, and durable audit persistence are intentionally not represented as passing mock checks.

## Remaining gates before activation

All seven remain `testing`; operational activation is not authorized by this change. Before any separate activation decision:

1. **Completed 2026-11-24:** applied and verified the testing-only registry migration in production; all seven remain `testing`, inactive, and human-review-gated.
2. Reconcile the nonterminal Career Discovery test records and confirm no prepared request can reach the deployed runtime after an agent is deactivated.
3. Update or replace the deployed runtime so Staff/Admin testing has an explicit mock-only path and every operational path re-checks current role, owner role, active status, workflow contract, and human-review configuration.
4. Verify database transition and approval protections for each workflow in an isolated environment with mocked providers. Keep request, preparation, result persistence, and human approval as separately observable states.
5. Have a qualified human review each agent’s synthetic and representative outputs, including evidence, factual claims, consent, pricing, deadlines, publication, and external-action boundaries as applicable.

The local mock proves only the seven workflow contract fixtures and UI reporting. It does not certify the deployed database or Edge Function.


## Research & Opportunities AI follow-up

The repository had no Admin research entry point for `opportunity_research`, only the synthetic workflow contract. The Admin agent card now opens a test-only manual research workspace. Staff can prepare search terms, open a search homepage, review primary sources themselves, record an opportunity and deadline, mark source/deadline review state, see a count-based report, and export separate CSV files. Data remains in browser memory for the session. The workspace does not scrape websites, call search APIs or AI providers, persist records, or send communications. Its report distinguishes checked from unverified sources and deadlines; it does not claim the synthetic/manual path proves live research capability.

Validation: local Node tests cover query preparation, report counts, the Admin initiation control, and the no-network/session-only boundary. No paid search or inference was used. This agent remains in testing, and humans must verify primary source, eligibility, and deadlines before acting on or sharing results.


## Sales Proposal AI follow-up

The repository had no proposal-generation UI for `proposal_generation`, only its synthetic workflow contract. The Admin agent card now opens a local proposal-template preview for Staff-supplied organization, service, needs, objectives, deliverables, timeline, and assumptions. Pricing remains pending unless explicitly marked confirmed. The preview includes exclusions against guaranteed outcomes and next steps that require authorized human approval; it can be downloaded as Markdown but is not saved to the database or sent. It performs no model, runtime, or network call and does not create financial or contractual commitments.

Validation: local Node tests cover required inputs, price-status handling, human review, no-guarantee language, Markdown export, and the no-network Admin workspace boundary. No inference or external service was used. The agent remains in testing.


## CEO Operations AI follow-up

The repository had no Admin workflow UI for `executive_performance_review` beyond its synthetic mock test. The CEO-owned card now exposes a separate Admin-only aggregate review workspace. It accepts a reporting period, target, completed count, and aggregate quality score, then deterministically reports completion rate, threshold risks, and suggested actions. It excludes individual staff assessment and source-data verification. The preview is not persisted and can be downloaded as Markdown; it makes no provider, runtime, or network call.

Validation: local Node tests cover input bounds, aggregate calculations, Admin-only visibility, evidence limitations, and the no-network boundary. No AI inference or database write was used. Human review remains required and the agent stays in testing.


## Production registry safety update

On 2026-11-24, the testing-only migration `20261124170000_staff_admin_agents_testing_only` was applied to the existing production Supabase project. A follow-up read-only query returned exactly these seven agent keys, each with `status = testing`, `active = false`, and `human_approval_required = true`. The migration guard also required all seven rows to match. No provider/model calls were made.


## Career Discovery AI follow-up

- Added a distinct Staff/Admin-guarded `Initiate Career Discovery AI` workspace for `career_profile_analysis`, separate from the seven-agent contract-test button and the autonomous functional test.
- It accepts synthetic education, experience, skills, career goal, and optional target roles. The local preview reports the supplied profile, user-stated direction, targets, preparation recommendations, and evidence gaps. It does not infer qualifications or evaluate a real account profile.
- The preview can be downloaded as Markdown. Data remains in the browser session; there is no database persistence, network call, provider/model inference, credit use, or operational execution.
- Human review is required before any use of career guidance. The agent remains in testing.
- Validation: three focused Node tests cover output fields, input errors, the Admin page role gate, and absence of provider/network/database calls.


## CV & LinkedIn AI follow-up

- Added a distinct Staff/Admin-guarded `Initiate CV & LinkedIn AI` workspace for `cv_service_delivery`, separate from the autonomous functional test and shared contract mock.
- The local formatter accepts synthetic target role, summary, experience evidence, and skills. It produces CV and LinkedIn draft structures without adding achievements, dates, metrics, or credentials not supplied in the fixture. It can download a Markdown preview.
- The workspace has no account-profile access, provider/model inference, runtime call, database write, or persistence. It labels output as testing-only and requires source-document verification and human review.
- Validation: three focused Node tests cover draft contract, input limits, Staff/Admin gating, and absence of provider/network/database calls.


## Marketing Content AI Admin initiation follow-up

- Added a separate Staff/Admin-guarded `Initiate Marketing Content AI` control on the Admin AI Agents card. The prior Blog Management page remains Admin-only because it can save and publish posts.
- The new workspace accepts synthetic topic, audience, CTA, and optional brand guidance and generates a deterministic local template with one repurposed draft and Markdown download.
- It does not call an AI provider, runtime, or database and cannot save, publish, or send content. Human review remains required. The registry agent stays `testing`, inactive, and human-review-gated.
- Validation: focused Node tests cover output shape, input errors, Staff/Admin gating, and absence of provider/network/runtime/database calls.


## CEO Operations AI — staged operational path

The separate Admin initiation workspace now has two distinct actions: a deterministic local aggregate preview, and a Groq-backed operational draft action. The live action is available only when the registry reports this agent as `status = live`, `active = true`, and `human_approval_required = true`; it submits the fixed `executive_performance_review` workflow through request, preparation, and the governed runtime. `live` is the allowed operational registry status in the database check constraint; `active` is not a valid status value. CEO Operations is the only agent permitted by this staged implementation. The other six operational workflows remain blocked until their own agent-by-agent work is complete.

The deployed Supabase Edge Function version 27 was retrieved read-only and added as tracked source. The new Staff/Admin path requires an active Admin for the Admin-owned CEO agent, an active matching workflow, the explicit operational trigger, fixed server-side output schema, aggregate-only inputs, Groq strict JSON output, and configured provider/model/price/spend-limit settings. It persists provider, model, token counts, estimated cost, output-contract status, and the human-review state. The run remains `awaiting_human_review`; completing it requires an independent approval record. It cannot identify or assess individual employees or recommend employment actions. No external action is available from this workflow.

A migration adds direct-RPC request guards and execution triggers. It requires the operational registry state (`status = live`, `active = true`, and human review enabled), enforces the CEO owner role, rejects other six agents during this rollout stage, limits CEO input to aggregate values and a reporting period, blocks client-supplied schema/routing overrides, and prevents the seven agents' execution review flag from being cleared or completed without independent approval. It was applied to the existing non-production test project for DDL validation only; no production database was changed.

## Validation and release status

- `npm run test:admin-ceo-operations`: 5 passed, including mocked request, preparation, runtime, and independent-review handoff.
- `npm run test:staff-admin-agent-operational-policy`: 9 passed, including staged allowlist, Admin-only CEO access, invalid/individual inputs, output schema, human-review enforcement, and migration guard source checks.
- `npm run test:staff-admin-groq-transport`: 3 passed using injected mock fetch responses; no network request or inference was made.
- `git diff --check`: passed.
- The Vercel pull-request preview completed with `READY`; its Next.js build and application TypeScript check passed. This was a preview build only, not production.
- No provider/API/model calls or production database/deployment changes were made. The connected Vercel project generated a pull-request preview build; no production alias was changed.
- PostgreSQL accepted the guard migration in the existing non-production test project. Anonymous request and review-flag-clear smoke checks were rejected by the database triggers. A request/preparation test using synthetic aggregate input completed inside a transaction and was rolled back; registry state and operational request/execution counts were verified unchanged afterward.
- The database test exposed and corrected two migration defects: the registry uses `live` rather than `active` for operational status, and PostgreSQL has no `jsonb_object_length` function. JSON object key counts now use `jsonb_object_keys`.
- Deno syntax/type checking with temporary local stubs for Supabase and edge-runtime imports passed. A follow-up check using the actual Supabase npm SDK could not complete because the environment stalled downloading from `registry.npmjs.org`; actual SDK typings remain unverified.
- The user confirmed the Groq runtime secret is configured. The secret value was not retrieved or printed. Provider-side spending limits and alerts, the configured model and rates, and the target project's secret presence were not independently verified through available account tools. No model-provider call was made.

The CEO agent remains **not active in production**: its verified registry row is still `testing`, inactive, and human-review-gated. The code path cannot run until the runtime is safely deployed and provider billing controls are verified. All seven agents remain testing/inactive in production. No production deployment occurred.

## Career Discovery initiation control follow-up

- Added the dedicated `Initiate Career Discovery AI` toggle to the Staff/Admin Agents card. It opens the existing local `career_profile_analysis` test workspace; it does not call the autonomous functional test or live runtime.
- Staff/Admin gating remains in place. Validation includes a source guard for the distinct control and its state toggle.

## Marketing Content AI Admin initiation follow-up

- Added a separate Staff/Admin-guarded `Initiate Marketing Content AI` control on the Admin AI Agents card. The prior Blog Management page remains Admin-only because it can save and publish posts.
- The new workspace accepts synthetic topic, audience, CTA, and optional brand guidance and generates a deterministic local template with one repurposed draft and Markdown download.
- It does not call an AI provider, runtime, or database and cannot save, publish, or send content. Human review remains required. The registry agent stays `testing`, inactive, and human-review-gated.
- Validation: focused Node tests cover output shape, input errors, Staff/Admin gating, and absence of provider/network/runtime/database calls.

## Career Discovery AI — staged Groq workflow

- Added a distinct Groq draft action inside the Career Discovery workspace. It uses only bounded synthetic education, experience, skills, goal, and target-role inputs and the existing `career_profile_analysis` workflow. Obvious contact details and profile URLs are rejected by the server policy and the database request guard.
- Added a strict output contract for career direction, target roles, recommendations, and evidence gaps. Runtime results must report `awaiting_human_review`, `human_review_required = true`, `human_review_gate = true`, and `human_approved = false`; the UI offers a separate independent approval request and never completes the execution.
- The action is available only when the registry reports `status = live`, `active = true`, and human approval enabled. It remains unavailable while Career Discovery is `testing` or otherwise inactive. Staff and Admin may access the Staff-owned workflow; the database checks active Staff/Admin role and exact owner/workflow state.
- Staff/Admin operational runs bypass client AI-credit reservation. Provider usage and estimated cost are still logged through the existing runtime path. The local deterministic preview remains free and separate.
- The additive database guard migration was applied only to the existing non-production test project. A rollback-only synthetic request/preparation transaction succeeded after temporarily matching the test registry owner/status fields; follow-up verification confirmed the original registry state and no operational requests persisted. No Groq inference was made.
- Focused validation: Career Discovery workspace tests **3 passed**; entrypoint test **1 passed**; mocked operational handoff tests **3 passed**; shared CEO workflow tests **5 passed**; Staff/Admin policy and database guard tests **11 passed**; Groq transport tests **3 passed**; `git diff --check` passed.
- The actual Supabase SDK typecheck remains unavailable because the package download stalled; the local Deno stub check does not certify SDK typings. Provider account spending limits and configured rates remain unverified. No production registry or deployment changes occurred.

Career Discovery remains `testing` and inactive in production. Independent human review is required before using any model-generated guidance; reviewers must verify evidence and current role requirements. The other five operational workflows remain blocked pending their own agent-specific rollout passes.
