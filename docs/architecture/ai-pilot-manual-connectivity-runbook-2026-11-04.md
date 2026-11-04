# CareerDev Global — manual AI provider preflight runbook (4 November 2026)

**Owner decision:** Draft PR #43 is OFF by default. Model-catalogue checks require independent operator verification before use. The deployed Supabase AI runtime and live application do not import this module.

## Current source-of-truth status (read-only)

- Vercel project `careerdevglobal` exposes only a generic Preview `GROQ_API_KEY` environment **name**, not a verified, dedicated `GROQ_PILOT_API_KEY` or `OPENAI_PILOT_API_KEY`. No values were read. Name presence is not proof of permission, available credits or a provider-side spend limit.
- Isolated Supabase project `yyevuwvtrktrzwuzeddo` contains **21** auth accounts; an aggregate inspection found **zero** with explicit `raw_app_meta_data` `purpose` in `synthetic/test/pilot` or `is_test=true`. Missing markers do not prove accounts are real, and markers alone would not prove they are safe test fixtures. Do not process these accounts in live AI tests until the owner independently verifies them.
- TEST `reserve_ai_credits` uses the patched execution/request/agent idempotency binding (MD5 `b9c0ffb6432e9f9da7d8010845df0e77`). Both billing release gates remain OFF. This does not establish production credit-settlement parity.

## Verified vendor limits — distinguish budget alerts from enforced stops (4 November 2026)

**OpenAI:** Project monthly spend limits can be alert-only. In API platform project **Limits**, configure an owner-approved budget and turn on **Enforce a hard limit**; an alert alone does not block usage. Enforcement can lag behind recorded usage, so cap overruns remain possible. Also restrict model access and rate limits. Reference: https://help.openai.com/en/articles/9186755-managing-projects-in-the-api-platform

**Groq:** Paid-tier monthly spending limits are **organization-wide**, shared across all Groq projects and API keys, **not** separate per-key limits. They require paid-tier and organization-owner permissions. Go to **Settings → Billing → Limits**, add an organization monthly cap and alerts. Groq states usage is tracked with a **10–15 minute delay**, which can permit slight overshoot. Reference: https://console.groq.com/docs/spend-limits

**Groq project isolation:** Use a separate *pilot project* with its own keys, limited model permissions and restrictive request rate limits, but these per-project rate limits are **not monetary hard caps**. The pilot should also use a separate Groq **organization from production** so a shared organization-wide cap cannot accidentally block the production workload. If that isolation is unavailable, leave this conservative preflight on **HOLD** instead of asserting it. Reference: https://console.groq.com/docs/projects

This is a guard against accidental use. The environment attestations do **not** verify vendor settings automatically and are not evidence that such controls are active. Capture owner-reviewed settings/evidence privately, with any tokens, account IDs, emails and billing identifiers redacted.

## Stage A — read-only OpenAI/Groq model catalogue (no inference)

This stage **may** be run manually only after the owner independently documents all of these conditions:

1. Two separate provider-issued pilot-only credentials are created and stored securely, distinct from production and generic Preview keys. Do not paste key material into commits, chat, tickets or CI logs.
2. Verify the **OpenAI project** limit has **Enforce a hard limit** enabled, not just an alert, and the **Groq pilot organization** has its own paid-tier monthly monetary limit (not just per-project RPM/TPM rate limits). Confirm the Groq pilot **project and organization are separate from production**. These vendor controls can lag, so a spending cap is not a guarantee against minor overages. If these controls cannot be independently confirmed, do not proceed.
3. The owner explicitly approves the bounded catalogue-only trial and selected model IDs. This is **not** approval for paid inference or deployment.
4. A local, isolated manual shell is used; never enable it in Vercel, GitHub Actions or `NODE_ENV=production`.

The following are **variable names, not actual values**. Configure them using a secure local secrets tool:

```text
CAREERDEV_AI_MODEL_PREFLIGHT=true
CAREERDEV_ISOLATED_TEST_PROJECT_REF=yyevuwvtrktrzwuzeddo
CAREERDEV_PILOT_OWNER_APPROVED=true
CAREERDEV_PILOT_BUDGET_CAP_VERIFIED=true
CAREERDEV_OPENAI_ENFORCED_HARD_LIMIT_VERIFIED=true
CAREERDEV_GROQ_ORG_SPEND_LIMIT_VERIFIED=true
CAREERDEV_GROQ_PILOT_PROJECT_ISOLATED=true
CAREERDEV_GROQ_PILOT_ORG_SEPARATE_FROM_PRODUCTION=true
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
