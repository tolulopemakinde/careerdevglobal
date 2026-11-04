# CareerDev Global — Approved High-Priority AI Integrations

**Decision date:** 2026-11-04  
**Status:** Architecture and risk-gated implementation plan; **not deployed**  
**Repository baseline:** `main`, audited read-only 2026-11-04  
**Decision:** Only Groq, one of Exa/Tavily, Vercel AI SDK, and LiteLLM are in scope. Other proposed integrations are deferred.

## 1. Approved scope

| Component | Purpose | Implementation boundary |
|---|---|---|
| OpenAI | Retain as primary existing inference provider | Do not remove existing integrations |
| GroqCloud | Test as secondary inference provider | GPT-OSS 120B/20B candidates; verify account enablement and task compatibility |
| Exa **or** Tavily | Grounded career, employer and job-market research | Select one provider after comparative evaluation; do not silently activate both |
| Vercel AI SDK (`ai`) | Typed, uniform application-side generation/streaming | Introduce to new Next.js server-only adapter first; no broad rewrite |
| LiteLLM Gateway | Centralized model routing, budgets, logs, provider retry/fallback | Separate managed/self-hosted gateway; not assumed to run inside a Vercel serverless function |
| Calendly | Existing booking and Google Calendar sync | Keep authoritative scheduling integration; no Groq Google Workspace MCP |

**Explicitly deferred:** Google Workspace connectors (Gmail, Calendar, Drive), LangGraph, Composio, LiveKit, other research tools and unrelated AI integrations.

## 2. Current evidence and constraints

- `package.json` on `main` lists Next.js 16.4.0, React 19.3.0, Supabase and Sentry but **does not list** Vercel AI SDK, Groq, LiteLLM, Exa or Tavily.
- `supabase/functions/careerdev-coach-matching/index.ts` currently uses `new Supabase.ai.Session("gte-small")`; embeddings and retrieval must **not** be routed blindly to chat-completion models.
- Existing billing, subscription/AI credit, authorization, rate-limit, and RLS protections are separate authorities and must not be bypassed by an AI gateway.
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
    '-- LiteLLM virtual key -> gateway
              |-- OpenAI (primary)
              '-- Groq (eligible alternative)
                     |
                 Structured output validated against agent schema
                     |
        Existing AI credit finalize / refund logic
                     |
           Coach review where required; audit record
```

**Do not expose** OpenAI, Groq, Exa/Tavily, LiteLLM, Supabase service-role keys or OAuth secrets in client code. Do not let the gateway enforce paid entitlements on its own. Its budgets are a secondary cost-control layer, not the business source of truth.

## 4. Provider-specific guardrails

1. **Capability routing:** Add per-agent allowlists for model IDs, tool use, streaming, structured JSON, embeddings and context requirements. Disable fallback unless model-equivalence tests pass.
2. **Credit safety:** Reserve credit **once per user request**. Track retries and provider handoffs as one logical operation. Finalize/refund idempotently; avoid double charges.
3. **Research trust:** Search results are untrusted input. Normalize URL, publisher, retrieval timestamp, role/company, job-posting date and confidence. Do not represent old postings as open jobs. Distinguish sourced facts from AI advice.
4. **Security:** Request authentication, ownership checks, RLS, SSRF-safe source handling, input/output size limits, timeouts, rate limits and sensitive-data redaction.
5. **Quality:** CV/assessment fields require consent and minimum necessary disclosure; no real client data used in the initial proof-of-concept; human review for consequential recommendations.
6. **Resilience:** Fail closed for unauthorized calls; return clear temporary error or existing no-AI fallback when both providers are unavailable. Never downgrade to an unapproved model.
7. **Observability:** Correlate request ID, agent, provider, model, latency, token count, cost, search retrieval and credit transaction, without raw CV/email logging.
8. **LiteLLM infrastructure:** Prefer an isolated managed container with authenticated endpoint, database-backed budgets, network restrictions, secret rotation, backups and uptime checks. Verify gateway availability before redirecting customer traffic. LiteLLM without a connected database does **not** enforce virtual-key budgets.
9. **Source control:** Package installation and lockfile updates must occur in an authenticated, reproducible development environment. Never hand-edit lockfiles based on guesses.
10. **Release boundary:** No production secrets, database changes, merges or deployments until tests and human review have passed.

## 5. Phased delivery and acceptance

### Phase A — technical audit (read-only)

- Map every currently active agent to its actual runtime: Next.js route, Supabase Edge Function, DB function or other service.
- Inventory existing OpenAI calls, embeddings, structured response formats, prompt versions, tools, payment entitlements, feature flags and observability.
- Confirm conflicts with PR #39, #42 and schema-recovery/agent drafts.
- Deliver a compatibility matrix: `agent -> current runtime -> task type -> eligible provider -> review gate`.

### Phase B — baseline provider adapter and test harness (development only)

- Install `ai` plus the version-appropriate SDK provider(s) and `@ai-sdk/openai-compatible` after checking actual package/lockfile and bundled docs.
- Add a new internal-only endpoint or test harness with deterministic synthetic career profiles.
- Configure LiteLLM gateway with named model aliases mapping explicitly to OpenAI and Groq; access through authenticated server-side calls only.
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
- [ ] Isolated non-production Supabase and gateway test infrastructure validated.
- [ ] Up-to-date package versions and lockfile produced by package manager.
- [ ] All agents evaluated against capability compatibility; unsupported agents remain unchanged.
- [ ] Research source provenance, job freshness and prompt-injection controls verified.
- [ ] Idempotent AI credit accounting on retries/fallback proven.
- [ ] Authorization, RLS, tenancy and rate-limit tests pass.
- [ ] Gateway budgets persist across restarts and outages.
- [ ] Dependency, typecheck, build and applicable validation scripts pass.
- [ ] Preview and rollback evidence reviewed; explicit production approval obtained.

## 7. Official references

- Vercel AI SDK providers: https://ai-sdk.dev/providers/ai-sdk-providers
- Groq models: https://console.groq.com/docs/models
- LiteLLM gateway: https://docs.litellm.ai/docs/simple_proxy
- LiteLLM gateway budgets: https://docs.litellm.ai/docs/proxy/docker_quick_start
- Exa pricing: https://exa.ai/pricing
- Tavily pricing: https://www.tavily.com/pricing

**This document scopes future work; it does not assert that any new integration is installed, tested or deployed.**
