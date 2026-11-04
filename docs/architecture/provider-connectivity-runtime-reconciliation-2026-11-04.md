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
