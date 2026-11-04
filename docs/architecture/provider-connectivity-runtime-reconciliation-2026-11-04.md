# CareerDev Global — AI provider connectivity and runtime reconciliation

**Audit date:** 2026-11-04  
**PR:** https://github.com/tolulopemakinde/careerdevglobal/pull/43  
**Status:** Read-only production and test Supabase inspection; development-only safety improvements. **No Supabase configuration or live AI traffic modified.**

## Key findings (verified)

| Property | Production (`careerdev-global`) | Isolated AI test project (`careerdevglobal-ai-test`) |
|---|---|---|
| Project ref | `ufmhrmzumqkjvaezrmxf` | `yyevuwvtrktrzwuzeddo` |
| `careerdev-ai-agent-runtime` | Version **25** | Version **2** |
| Deployed source | 244 lines | 261 lines |
| Migration history records | **229** | **22** |
| OpenAI Responses API | Used | Used |
| Groq API | No reference | No reference |
| Built-in `web_search` | Used | Used |
| Structured `json_schema` | Used | Used |
| `reserve_ai_credits` | Present | Present |
| `finalize_ai_credit_charge` | Present | Absent |
| `claim_ai_runtime_credit` | Absent | Present |
| `settle_ai_credit_charge` | Absent | Present |

**Production and test runtimes are not interchangeable.** Their source differs in credit-settlement and response handling, not only package imports.

### Credit handling and invocation differences

- Production calls `reserve_ai_credits` then `finalize_ai_credit_charge` (consumed/released).
- The test project calls `reserve_ai_credits`, `claim_ai_runtime_credit` and `settle_ai_credit_charge` under a response-settlement wrapper.
- The test project verifies active profile and owned execution in its reserve-credit function, and includes additional transaction locking.
- Production may finalize an AI credit as **consumed before parsing output JSON**. This is a potential billing-reconciliation issue on invalid provider outputs and must be reviewed under the existing billing PR #42, **not silently changed in PR #43**.
- A model/provider fallback requires **one logical execution and one idempotent AI-credit reservation**. Live fallback is disallowed until reconciled and explicitly approved.

### Privilege and RLS metadata (read-only)

- Production `reserve_ai_credits` is SECURITY DEFINER, executable by `authenticated` and `service_role`, **not** by `anon`.
- In the test project, `reserve_ai_credits` is SECURITY DEFINER and executable by `anon`, `authenticated` and `service_role`.
- The inspected test reserve-credit body uses `auth.uid()`, rejects missing authentication, and requires an active eligible profile; therefore **the broader anonymous EXECUTE permission is not, by itself, evidence of unauthorized credit access**.
- `claim_ai_runtime_credit` and `settle_ai_credit_charge` in the test project are executable only by `service_role` among the three inspected roles.
- The inspected AI request, execution, ledger, usage and workflow execution tables in **both** projects have row-level security enabled. RLS-enabled alone does not prove every policy is correct.

**Reconciliation gate:** Review the test project's broader `anon` execution grant and align it with an owner-approved least-privilege policy *only after* recording its exact DDL/migration and verifying its invocation paths. No grant was changed during this audit.

### Source of truth and change control

The repository on `main` does not yet contain the authoritative deployed production AI-agent runtime. Do not overwrite the test function with production source: runtime v2 also uses its test-only credit RPC contract, and a blind copy could invalidate billing safety.

The source-of-truth recovery PR #36, AI pilot PR #39 and billing PR #42 are separate **open draft** changes. Resolve any migration conflicts and select an authoritative contract before upgrading the test environment.

## Read-only connectivity preflight added

The PR now includes `lib/ai/pilot/model-connectivity.mjs`, tested with mocked HTTP GET calls, and a disabled-by-default opt-in command `scripts/run-ai-model-connectivity.mjs`.

The preflight checks **only** authenticated model-catalogue availability:

- OpenAI: `GET https://api.openai.com/v1/models`
- Groq: `GET https://api.groq.com/openai/v1/models`

No completions, browser search, embeddings, billable model inference, personal data or Supabase database writes are involved. This is **not** proof of model-output compatibility, a guaranteed free request or approval to use production API keys.

### Required isolated configuration

To run manually in an authenticated development shell, set **dedicated** pilot-only keys securely and configure:

```text
CAREERDEV_AI_MODEL_PREFLIGHT=true
CAREERDEV_ISOLATED_TEST_PROJECT_REF=yyevuwvtrktrzwuzeddo
OPENAI_PILOT_API_KEY=<dedicated test-only secret>
GROQ_PILOT_API_KEY=<dedicated test-only secret>
OPENAI_PILOT_MODEL=<approved model ID>
GROQ_PILOT_MODEL=openai/gpt-oss-120b
```

Then run: `node scripts/run-ai-model-connectivity.mjs`. Never put actual keys in files, PR comments or logs. The script refuses the production project ID and environment, disallows generic key reuse when it can detect it, and prints only connection status/model availability. No live preflight was run as these approved pilot keys were not verified.

Vercel environment **name-only** inspection found `GROQ_API_KEY` targeted to Preview, but it was not branch-specific. This is **not** the dedicated `GROQ_PILOT_API_KEY` required by the preflight; values were not retrieved. No project `OPENAI_API_KEY` name was returned.

## Changes in Draft PR #43

1. Tightened synthetic fallback classification: HTTP 429 is retryable only when explicit rate-limit evidence exists; billing exhaustion and user cancellation **never** trigger the secondary provider.
2. Added automated regression tests for quota exhaustion, billing errors, manual abort and provider-key isolation.
3. Added an isolated model-catalogue preflight; it is never invoked by production or routine CI.
4. Preserved existing Vercel AI SDK v7 adapter, research clients, test suites and Next.js production routes unchanged.

## Work remaining before live provider trial

- [ ] Review owner-approved authoritative AI runtime source and test/production credit RPC compatibility.
- [ ] Confirm the separate Supabase test project contains no production client data or live billing credentials.
- [ ] Reconcile `reserve_ai_credits` privilege drift and decide between the production `finalize` contract and the test `claim/settle` contract in coordination with PR #42.
- [ ] Configure isolated OpenAI and Groq pilot credentials with capped budgets and approved model IDs.
- [ ] Execute read-only model catalogue preflight, then **separately** authorize bounded synthetic inference with observed provider cost, rate limits and output-schema validation.
- [ ] Complete equally scoped Exa vs Tavily live research benchmark and select one.
- [ ] Run full QA and owner review before changing any existing production AI-agent traffic.

**Release decision:** HOLD. Do not merge, deploy, modify database grants, change Supabase runtime code, or enable automatic live fallback from this PR.

## Follow-up assessment — 2026-11-04

### Security advisors (read-only)

Supabase security advisors returned the following grouped findings:

| Advisor | Production | AI test |
|---|---:|---:|
| `anon_security_definer_function_executable` | 1 | 9 |
| `authenticated_security_definer_function_executable` | 52 | 44 |
| `rls_enabled_no_policy` (INFO) | 16 | 32 |
| `function_search_path_mutable` | 0 | 4 |
| `extension_in_public` | 0 | 2 |

These are **advisory counts, not validated exploits**. Service-only tables can intentionally have RLS enabled without client policies, and public-coach discovery functions may intentionally be callable anonymously. Inspect invocation boundaries and actual function bodies before any grant/DDL changes.

- Test project's `reserve_ai_credits` was flagged as anonymous-executable SECURITY DEFINER, while the production grant is narrower. A read-only inspection of its test function source found `auth.uid()` validation, active-profile checks and owned-execution checks. It must still undergo least-privilege review; no exploit has been demonstrated.
- Security advisor references: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable and https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

### Provider compatibility boundary (official documentation checked)

The deployed runtime sends an OpenAI Responses API request with `web_search` and strict `json_schema`. Groq currently supports GPT-OSS 120B and 20B with strict structured output, but its Structured Outputs documentation warns that **streaming and tool use are not supported together with Structured Outputs**. Although the Groq Responses API supports browser search independently, a single-call combination with strict JSON is **not assumed equivalent**. See:

- https://console.groq.com/docs/structured-outputs
- https://console.groq.com/docs/responses-api
- https://console.groq.com/docs/models

The safest **candidate architecture for isolated comparison** is a two-stage workflow: first fetch and separately validate cited career/employer facts with Exa or Tavily; then pass bounded, reviewed factual excerpts to a strict JSON Groq generation step without model-side tools. Exa and Tavily request formats were cross-checked against current official references (https://exa.ai/docs/reference/search and https://docs.tavily.com/documentation/api-reference/endpoint/search). This design still requires an explicitly scoped test and may have different latency/cost from single-call OpenAI.

Added `lib/ai/pilot/agent-capability-gate.mjs` and `scripts/test-ai-agent-capabilities.mjs` to **block unsafe inferred equivalence** in the draft test policy. These are review/planning safeguards and do not authorize live runtime use.

### Cross-PR integration constraints

- Draft PR #42 contains a separately proposed AI credit/claim/settle runtime, migrations and billing tests. It must remain the source of truth for billing fixes; do **not** duplicate or overwrite its work in PR #43.
- Draft PR #39 modifies the AI pilot runtime and provider boundaries; reconcile that scope before any integration with live agents.
- Draft PR #36 covers schema source-of-truth recovery; this audit alone is not sufficient to regenerate schema/migrations.

### Release checklist

Current JSON evidence ledger: `docs/architecture/ai-provider-release-evidence-2026-11-04.json`. All 11 gates remain **unverified**. Passing the document's unit tests only proves fail-closed status evaluation, **not** readiness or live provider accessibility.

## Synthetic account provenance check — 2026-11-04 (read-only aggregates)

An aggregate-only inspection of the isolated Supabase AI test project (`yyevuwvtrktrzwuzeddo`) returned **21** records in `auth.users`, **11** records in `ai_agent_subscriptions`, **3** records in `ai_credit_ledger`, and **0** records in each of `ai_agent_execution_requests` and `ai_usage_events`. No individual user rows, names, email addresses, personal profiles, payment information or subscription details were retrieved.

**These counts do not prove whether the accounts are synthetic.** Before any live inference or billing sandbox exercise, the owner must verify the origin of those accounts and confirm that the test environment has no copied production client data and no live provider/payment credentials. A read-only account-count query does not grant permission to reuse those records for test inference.

## SDK retry elimination and transport verification — 2026-11-04

- Vercel AI SDK `generateText` defaults to two automatic retries. The isolated adapter now sets `maxRetries:0` for each provider request so that retries are controlled exclusively by the application's one-primary/one-eligible-fallback policy. See https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text.
- Added no-network integration tests that pass fake HTTP `Response` objects through **actual AI SDK provider constructors and `generateText`**, including OpenAI Responses success, Groq Chat Completions success, HTTP 503, HTTP 429 quota exhaustion, and full adapter routing from OpenAI to Groq. No real API credentials or live network are used.
- GitHub Actions run [41806035860](https://github.com/tolulopemakinde/careerdevglobal/actions/runs/41806035860) passed **82 tests, 0 failures**, typecheck, source-secret audit, existing security/boundary checks, and application build for commit `7d170d5244dff39823b08d3ed7e7419d6a9ac645`.
- This does **not** establish live API model eligibility, AI-quality parity, costs, or safe production credit billing. The release decision remains **HOLD**.
