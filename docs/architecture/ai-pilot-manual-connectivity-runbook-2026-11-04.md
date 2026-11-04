# CareerDev Global — manual AI provider preflight runbook (4 November 2026)

**Owner decision:** Draft PR #43 is OFF by default. Model-catalogue checks require independent operator verification before use. The deployed Supabase AI runtime and live application do not import this module.

## Current source-of-truth status (read-only)

- Vercel project `careerdevglobal` exposes only a generic Preview `GROQ_API_KEY` environment **name**, not a verified, dedicated `GROQ_PILOT_API_KEY` or `OPENAI_PILOT_API_KEY`. No values were read. Name presence is not proof of permission, available credits or a provider-side spend limit.
- Isolated Supabase project `yyevuwvtrktrzwuzeddo` contains **21** auth accounts; an aggregate inspection found **zero** with explicit `raw_app_meta_data` `purpose` in `synthetic/test/pilot` or `is_test=true`. Missing markers do not prove accounts are real, and markers alone would not prove they are safe test fixtures. Do not process these accounts in live AI tests until the owner independently verifies them.
- TEST `reserve_ai_credits` uses the patched execution/request/agent idempotency binding (MD5 `b9c0ffb6432e9f9da7d8010845df0e77`). Both billing release gates remain OFF. This does not establish production credit-settlement parity.

## Stage A — read-only OpenAI/Groq model catalogue (no inference)

This stage **may** be run manually only after the owner independently documents all of these conditions:

1. Two separate provider-issued pilot-only credentials are created and stored securely, distinct from production and generic Preview keys. Do not paste key material into commits, chat, tickets or CI logs.
2. The account/project owners independently verify restrictive provider-side spending safeguards for each credential and acceptable potential request charges. If a provider cannot provide a suitable spend limit, use a segregated limited-balance test account or do not proceed.
3. The owner explicitly approves the bounded catalogue-only trial and selected model IDs. This is **not** approval for paid inference or deployment.
4. A local, isolated manual shell is used; never enable it in Vercel, GitHub Actions or `NODE_ENV=production`.

The following are **variable names, not actual values**. Configure them using a secure local secrets tool:

```text
CAREERDEV_AI_MODEL_PREFLIGHT=true
CAREERDEV_ISOLATED_TEST_PROJECT_REF=yyevuwvtrktrzwuzeddo
CAREERDEV_PILOT_OWNER_APPROVED=true
CAREERDEV_PILOT_BUDGET_CAP_VERIFIED=true
OPENAI_PILOT_API_KEY=<dedicated OpenAI test-only secret>
GROQ_PILOT_API_KEY=<dedicated Groq test-only secret>
OPENAI_PILOT_MODEL=<owner-approved model ID>
GROQ_PILOT_MODEL=openai/gpt-oss-120b
```

Then run **locally**:

```sh
node scripts/run-ai-model-connectivity.mjs
```

The command first evaluates `assessManualAiPilotPreflight` without network use. If anything is missing, it prints only an anonymized `HOLD` response with reason codes, `requestsSent:0`, and exit code 2. Only if this check is eligible will it send a bounded GET to each provider's **static model-listing endpoint**. The response prints only connection/model availability and HTTP status — not API keys, provider error payloads, account records or prompts.

**Caution:** Environment Boolean attestations are *operator claims*, not independently validated evidence. This lightweight CLI only prevents accidental requests under incomplete configuration. It does not confirm spend limits exist, that data is synthetic, or that model billing is zero.

## Stage B — paid synthetic inference remains blocked

A separate offline stage gate additionally requires:

```text
CAREERDEV_TEST_ACCOUNTS_PROVENANCE_VERIFIED=true
CAREERDEV_TEST_PAYMENT_ISOLATION_VERIFIED=true
```

Do **not** set these unless the owner has independently inspected and approved fixture origin and segregated provider/payment settings. Even with these variables set, the current script performs only model listing and **never makes an inference request**. Any future paid inference runner requires another owner-reviewed implementation and authorization step.

Before a live AI-agent trial: complete PR #42 production-appropriate reserve/claim/settle design, verify authenticated ownership/entitlements and RLS, pass single-reservation fallback/settlement against disposable accounts, confirm coach-review and structured output, measure provider cost, and obtain separate production release approval.

## Failure actions and cleanup

- A `HOLD` outcome means no provider catalogue calls were attempted; address each named blocker **without exposing key values**.
- HTTP 401/403/429/5xx or a missing model means **stop**, not automatically retry with production keys.
- Remove/unload the temporary shell credentials after manual use; revoke the pilot credentials if exposed.
- Never infer production readiness from a catalogue response, Vercel preview READY or passing offline tests.

## Boundary summary

No production deployment, live billing, Supabase function edits or migration changes are authorized by this runbook. PR #43 remains in draft, and the 11-gate evidence ledger remains HOLD until independent acceptance is complete.
