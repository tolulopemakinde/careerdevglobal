# CareerDev Global — Approved High-Priority AI Integrations

**Decision date:** 2026-11-04  
**Status:** Architecture and risk-gated implementation plan; **not deployed**  
**Repository baseline:** `main`, audited read-only 2026-11-04  
**Decision:** Prioritize Groq, Vercel AI SDK, and **one** career research provider (Exa or Tavily). Retain OpenAI as primary. **Suspend LiteLLM** and all other proposed integrations.

## Implementation checkpoint — 2026-11-04

The following **development-only, inactive scaffolding** has now been added on this draft branch:

- \`lib/ai/pilot/provider-routing.mjs\`: explicit OpenAI primary / Groq fallback policy for synthetic career profiles only, with default-off gate, bounded requests, transient-only retry conditions, sanitized errors and metadata-only audit callback.
- \`lib/ai/pilot/research-normalizer.mjs\`: source normalization for the Exa/Tavily comparison; deduplicates citations, bounds excerpts, rejects common unsafe links and never claims a listed job is verified open.
- \`scripts/test-ai-provider-pilot.mjs\` and \`scripts/test-ai-research-pilot.mjs\`: dependency-free Node test suites. Run with \`npm run test:ai-pilot\`.
- \`examples/ai-pilot/sdk-executor.example.mjs\`: inactive AI SDK integration reference, **not imported by an application endpoint**. It requires installation and validation of the real version-matched \`ai\`, \`@ai-sdk/openai\`, \`@ai-sdk/groq\` packages before execution.
- \`docs/architecture/exa-vs-tavily-evaluation-2026-11-04.md\`: objective benchmark and source-validation criteria; no research provider has been selected.

**Validation performed:** Eight injected-executor routing checks passed against the tracked module in a connector JavaScript harness; five research-normalization cases passed in a local Node 22 check using a separately reproduced copy of the module. These are **partial synthetic checks, not an execution of the full committed Node test suites, app typecheck or live API tests**. The restricted GitHub connector cannot run \`npm ci\`, and the local container cannot resolve the GitHub/npm hosts to install packages or obtain a source checkout.

**Still blocked:** a reproducible checkout; \`npm ci\` / \`npm install ai @ai-sdk/openai @ai-sdk/groq\` with matching lockfile; full Node test suite, TypeScript typecheck/build, isolated credentials and live OpenAI/Groq comparison, Exa/Tavily API-key tests, Supabase runtime/entitlement compatibility audit, and an authenticated preview deployment. **No agent or paid user traffic is routed by this branch.**

## 1. Approved scope

| Component | Purpose | Implementation boundary |
|---|---|---|
| OpenAI | Retain as primary existing inference provider | Do not remove existing integrations |
| GroqCloud | Test as secondary inference provider | GPT-OSS 120B/20B candidates; verify account enablement and task compatibility |
| Exa **or** Tavily | Grounded career, employer and job-market research | Select one provider after comparative evaluation; do not silently activate both |
| Vercel AI SDK (`ai`) | Typed, uniform application-side generation/streaming | Introduce to new Next.js server-only adapter first; no broad rewrite |
| LiteLLM Gateway | **Deferred** | No hosting, database, credentials, service setup, or gateway dependencies in the pilot |
| Calendly | Existing booking and Google Calendar sync | Keep authoritative scheduling integration; no Groq Google Workspace MCP |

**Explicitly deferred:** LiteLLM, Google Workspace connectors (Gmail, Calendar, Drive), LangGraph, Composio, LiveKit, other research tools and unrelated AI integrations. Revisit LiteLLM only if measured requirements justify a separate gateway.

## 2. Current evidence and constraints

- `package.json` on `main` lists Next.js 16.4.0, React 19.3.0, Supabase and Sentry but **does not list** Vercel AI SDK, Groq, LiteLLM, Exa or Tavily.
- `supabase/functions/careerdev-coach-matching/index.ts` currently uses `new Supabase.ai.Session("gte-small")`; embeddings and retrieval must **not** be routed blindly to chat-completion models.
- Existing billing, subscription/AI credit, authorization, rate-limit, and RLS protections remain authoritative; the new Next.js adapter must enforce them before any provider request.
- Other active draft PRs cover billing, schema recovery, AI governance and pilot agent runtime. Preserve their scopes and avoid touching those features in this plan.
- The source-of-truth Supabase migration history and isolated test environment require independent verification before any production migration.

## 3. Target request flow

```text
Authenticated client / coach UI
    |
Next.js server-side AI endpoint (Vercel AI SDK)
    |-- Auth / assigned coach and tenant authorization
    |-- Existing subscription entitlement + AI credit reservation
    |-- Agent / model capability allowlist + feature flags
    |-- Optional career research service (Exa OR Tavily)
    |       |-- approved search queries, bounded number of results
    |       |-- verified source URLs, publication/fetch timestamps, provenance
    |       '-- no automated job guarantee or fabricated employer claims
    |
    '-- Server-side provider router (Vercel AI SDK + application policy)
              |-- OpenAI (primary)
              '-- Groq (eligible alternative only)
                     |
                Structured output validated against agent schema
                     |
        Existing AI credit finalize / refund logic
                     |
           Coach review where required; audit record
```

**Do not expose** OpenAI, Groq, Exa/Tavily, Supabase service-role keys or OAuth secrets in client code. Implement routing, retries, logging and spending caps inside the authorized server-side adapter; Supabase remains the business source of truth for paid entitlements and AI credits. The AI SDK is a toolkit, not a hosted model router or automatic failover service. A separate gateway is **not** part of this pilot.

## 4. Provider-specific guardrails

1. **Capability routing:** Add per-agent allowlists for model IDs, tool use, streaming, structured JSON, embeddings and context requirements. Disable fallback unless model-equivalence tests pass.
2. **Credit safety:** Reserve credit **once per user request**. Track retries and provider handoffs as one logical operation. Finalize/refund idempotently; avoid double charges.
3. **Research trust:** Search results are untrusted input. Normalize URL, publisher, retrieval timestamp, role/company, job-posting date and confidence. Do not represent old postings as open jobs. Distinguish sourced facts from AI advice.
4. **Security:** Request authentication, ownership checks, RLS, SSRF-safe source handling, input/output size limits, timeouts, rate limits and sensitive-data redaction.
5. **Quality:** CV/assessment fields require consent and minimum necessary disclosure; no real client data used in the initial proof-of-concept; human review for consequential recommendations.
6. **Resilience:** Fail closed for unauthorized calls; return clear temporary error or existing no-AI fallback when both providers are unavailable. Never downgrade to an unapproved model.
7. **Observability:** Correlate request ID, agent, provider, model, latency, token count, cost, search retrieval and credit transaction, without raw CV/email logging.
8. **No new gateway infrastructure:** Do not deploy LiteLLM, its database, Redis or any proxy server. Implement only minimal server-side routing, configuration and usage audit needs. Evaluate optional gateway products separately only if later justified.
9. **Source control:** Package installation and lockfile updates must occur in an authenticated, reproducible development environment. Never hand-edit lockfiles based on guesses.
10. **Release boundary:** No production secrets, database changes, merges or deployments until tests and human review have passed.

## 5. Phased delivery and acceptance

### Phase A — technical audit (read-only)

- Map every currently active agent to its actual runtime: Next.js route, Supabase Edge Function, DB function or other service.
- Inventory existing OpenAI calls, embeddings, structured response formats, prompt versions, tools, payment entitlements, feature flags and observability.
- Confirm conflicts with PR #39, #42 and schema-recovery/agent drafts.
- Deliver a compatibility matrix: `agent -> current runtime -> task type -> eligible provider -> review gate`.

### Phase B — baseline provider adapter and test harness (development only)

- Install `ai` and the version-appropriate OpenAI and Groq SDK provider packages after checking the actual package/lockfile and bundled docs. Use only verified APIs and model IDs.
- Add a new internal-only endpoint or test harness with deterministic synthetic career profiles.
- Add a small application-owned, server-side provider router mapping agent-specific allowlisted models to OpenAI (primary) and Groq (eligible alternative), with bounded retries, request IDs, server-side usage logging and circuit-breaking as needed.
- Keep all existing live agent routes untouched, and enable test access only under a default-off feature flag.
- Validate JSON/schema quality, latency, timeouts, concurrency, provider exhaustion, invalid keys, and fallback correctness.

### Phase C — career research search pilot

- Compare Exa vs Tavily using a fixed test set: Nigerian and international career paths, employers, skills trends, career transitions and current vacancies.
- Score freshness, source provenance, duplicate removal, relevance, bad URLs and total cost; select **one** for pilot.
- Build a server-side research adapter returning citations and retrieval timestamps. Treat web search content as evidence, not instructions.
- Test geographic relevance and that stale/expired jobs are not presented as currently open.

### Phase D — one-agent canary and controlled rollout

- Start with the Career Discovery pilot only if operationally available and provider-compatible, otherwise an isolated testing harness.
- Check agent governance, coach review, subscriptions/credits and ownership boundaries end-to-end.
- Measure comparative failure rate, cost, latency and human-scored accuracy against existing provider baseline.
- Owner-reviewed Draft PR -> isolated preview -> rollback rehearsal -> explicit approval for any merge/deployment.

## 6. Non-negotiable release checklist

- [ ] Credentials are in secure environment configuration only; none committed.
- [ ] Isolated non-production application and Supabase test infrastructure validated; no separate AI gateway introduced.
- [ ] Up-to-date package versions and lockfile produced by package manager.
- [ ] All agents evaluated against capability compatibility; unsupported agents remain unchanged.
- [ ] Research source provenance, job freshness and prompt-injection controls verified.
- [ ] Idempotent AI credit accounting on retries/fallback proven.
- [ ] Authorization, RLS, tenancy and rate-limit tests pass.
- [ ] Existing server-side AI-credit accounting, request limits and spending controls persist correctly across retries, restarts and provider failures.
- [ ] Dependency, typecheck, build and applicable validation scripts pass.
- [ ] Preview and rollback evidence reviewed; explicit production approval obtained.

## 7. Official references

- Vercel AI SDK providers: https://ai-sdk.dev/providers/ai-sdk-providers
- Groq models: https://console.groq.com/docs/models
- Exa pricing: https://exa.ai/pricing
- Tavily pricing: https://www.tavily.com/pricing

**This document scopes future work; it does not assert that any new integration is installed, tested or deployed.**
