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

- All seven registry rows have `status = testing`, but also `active = true` and `human_approval_required = false`. This contradicts the intended test-only, human-reviewed boundary.
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
- Added a migration that pins the seven registry rows to `testing`, sets `active = false`, and requires human review. It includes a seven-row verification guard. The migration is only a proposed repository change and has not been applied to Production or another database.
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

1. Review and apply the testing-only registry migration through the approved database process, then verify all seven rows are still `testing`, inactive, and human-review-gated.
2. Reconcile the nonterminal Career Discovery test records and confirm no prepared request can reach the deployed runtime after an agent is deactivated.
3. Update or replace the deployed runtime so Staff/Admin testing has an explicit mock-only path and every operational path re-checks current role, owner role, active status, workflow contract, and human-review configuration.
4. Verify database transition and approval protections for each workflow in an isolated environment with mocked providers. Keep request, preparation, result persistence, and human approval as separately observable states.
5. Have a qualified human review each agent’s synthetic and representative outputs, including evidence, factual claims, consent, pricing, deadlines, publication, and external-action boundaries as applicable.

The local mock proves only the seven workflow contract fixtures and UI reporting. It does not certify the deployed database or Edge Function.
