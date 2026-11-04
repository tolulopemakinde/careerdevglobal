# AI provider integration — implementation checkpoint (2026-11-04)

**Branch:** `design-groq-research-gateway-2026-11-04`  
**Pull request:** https://github.com/tolulopemakinde/careerdevglobal/pull/43  
**Release boundary:** DRAFT. Do not merge or deploy to production.

## Implemented (development-only)
- Added pinned Vercel AI SDK 7.0.162 with `@ai-sdk/openai` 4.0.108 and `@ai-sdk/groq` 4.0.76 using the package manager in GitHub Actions; committed generated `package-lock.json`.
- Added `lib/ai/pilot/sdk-executor.mjs`, a real-provider-constructor adapter wrapped around the existing synthetic-only, default-off routing policy. It refuses execution in `NODE_ENV=production` and requires explicit isolated-test configuration, approved model IDs and a metadata-only audit callback.
- Added `lib/ai/pilot/research-clients.mjs` for bounded, fixed-endpoint Exa/Tavily synthetic search evaluation. It cannot run in production mode and never asserts a job is still open.
- Added no-network test suites `scripts/test-ai-sdk-pilot.mjs` and `scripts/test-ai-research-clients.mjs`; both are included in `npm run test:ai-pilot` and GitHub Actions.
- Removed the one-time, contents-write workflow after it generated and committed the pinned package manifest and lockfile; the retained CI workflow is read-only.

## Environment observation (metadata only)
Vercel project `careerdevglobal` currently lists an encrypted/sensitive `GROQ_API_KEY` with Preview target. It does **not** list a project `OPENAI_API_KEY` among the returned environment names. No secret values were accessed, displayed or committed, and no usage was incurred as part of this inspection.

**Key presence does not verify** it is authorized for an isolated billing-free test or that the underlying account has credits/models enabled. No live provider call was made.

## Supabase compatibility findings

Read-only source inspection of the deployed `careerdev-ai-agent-runtime` identified:

- Production version **25** and AI test project version **2**; the sources are non-identical and have not been reconciled.
- Both versions reference direct OpenAI Responses API requests, rather than an AI SDK provider abstraction.
- The production runtime requests built-in OpenAI `web_search` and strict JSON schema output. That workflow cannot be transferred to Groq without proving equivalent external research, schema validation and source provenance.
- In the inspected production path, `finalize_ai_credit_charge` for consumed output is called before the provider response is parsed into the agent-specific output object. Review error/credit lifecycle semantics before adding provider retries or fallback. This observation is **not** authorization to modify billing behavior.
- Existing Supabase credit reservation and review gates must remain authoritative. A synthetic Next.js adapter is **not** currently capable of replacing them.

## Safety boundaries

- No existing UI route, authenticated agent runtime, Supabase Edge Function or payment path imports the new provider adapter.
- No Groq, Exa or Tavily calls were sent; the added tests use dummy keys and synthetic responses.
- LiteLLM, Google Workspace MCP and unrelated services remain suspended.
- The draft branch's Vercel Preview builds are not production deployments.

## Remaining acceptance gates

1. Reconcile the test Supabase runtime with an owner-reviewed production-equivalent source and a verified sandbox environment, without copying client data or production secrets.
2. Confirm test credentials and model enablement for **both** providers in an isolated environment.
3. Execute and compare synthetic live requests for latency, token usage, outputs, deterministic fallback and limits.
4. Run equal-query Exa/Tavily live evaluations with authorized test keys; choose only one search provider.
5. Integrate into a single authorized agent behind feature flags only after RLS, subscription, credit-reservation/finalization, prompt/schema validation and coach-review gates are proven.
6. Pass CI, isolated preview tests, budget/credential tests and owner approval. Remain draft until those gates pass.

**No production changes were made.**

## SDK transport integration test milestone — 2026-11-04

**Problem resolved:** AI SDK `generateText` defaults to `maxRetries: 2`. When combined with the application-owned OpenAI-to-Groq fallback policy, unreviewed internal retries could multiply provider requests and costs without appearing as separate routing attempts. The isolated SDK adapter now passes **`maxRetries: 0`** on each provider request. One primary call and at most one explicitly authorized fallback is the intended limit.

- Unit tests verify that the SDK executor sends `maxRetries: 0` for both OpenAI and Groq.
- `scripts/test-ai-sdk-transport.mjs` exercises the **actual installed AI SDK** provider serializers/parsers via injected HTTP mock transport. It tests OpenAI Responses, Groq Chat Completions, and that simulated HTTP 429/503 failures do not trigger implicit SDK-level retries.
- The Groq SDK omits `stream` on the non-streaming request; the initial test incorrectly demanded `stream:false`. Fixed to assert streaming was not enabled. The actual request/response test passed otherwise.
- CI run [41805612163](https://github.com/tolulopemakinde/careerdevglobal/actions/runs/41805612163) passed **79 tests, zero failures**, plus source audit, TypeScript, boundary checks and Next.js build for commit `6be07f92bda49ce4e71b2088126b0001992a14df`.

This is a **wire-format simulation**, not real OpenAI/Groq service connectivity: the HTTP requests were intercepted by local functions, test credentials were fabricated, and no tokens were purchased or consumed. This does not validate server-side Supabase credit accounting, pricing, real fallback or live model suitability.

**Release blocker unchanged:** A separate pilot key pair with verified spending caps, a reconciled PR #42 sandbox credit contract, and bounded real provider tests are still necessary. Do not reuse general Vercel Preview `GROQ_API_KEY` unless its use as a capped isolated key is explicitly verified and approved.
