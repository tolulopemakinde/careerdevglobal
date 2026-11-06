# CareerDev Global — isolate Vercel AI Gateway evaluation, preserve OpenAI production

**Date:** 6 November 2026  
**Branch:** `design-groq-research-gateway-2026-11-04` (Draft PR #43)

## Decision and deployment boundaries

| Scope | Implementation | Merge/deployment gate |
|---|---|---|
| Current production AI agents | Existing OpenAI Direct Supabase Edge runtime, authorization, AI-credit lifecycle, coaching review | **UNCHANGED** |
| Synthetic comparison | Manual local Node.js script using Vercel AI Gateway (gateway-funded, NOT provider BYOK) | May merge as **dormant code** only after tests, diff review, and preview build |
| Live model calls | Two sequential Gateway calls with one identical fictional career profile, one filtered to OpenAI, one to Groq | Requires Gateway key budget, credits, secure key storage and owner authorization |
| User-facing automatic fallback | None | **NOT AUTHORIZED** by the synthetic experiment |
| Subscription payments and credits | Billing PR #42, Supabase | Separate acceptance and deployment decision |
| Exa/Tavily | Offline benchmarks only | Separate review; not integrated in production |

The gateway model identifiers are `openai/gpt-5.4-mini` (filter `only:['openai']`) and `openai/gpt-oss-120b` (filter `only:['groq']`), as present in Vercel's public model catalogue at design time. **Exact Groq serving endpoint eligibility has NOT been live verified.** The Groq-only request must fail closed instead of routing via a different provider. Re-check the live model catalogue and its endpoints before attempting a real paid request.

No Next.js API route, Supabase Edge Function, migration, user-facing component or subscription logic imports the pilot. It cannot silently switch customers from OpenAI Direct to Gateway.

## Manual owner setup (not available through current connected Vercel tools)

1. Open **Vercel Dashboard → AI Gateway → API Keys** (https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai-gateway%2Fapi-keys&title=AI+Gateway+API+Keys). Create a key named `careerdevglobal-synthetic-eval`. Enable an API-key spend quota of **$1** with `none` (non-resetting) refresh, if supported for this account. Confirm key-specific budget settings via dashboard. Gateway budgets are **soft** and the crossing request may slightly exceed the cap, so a $1 budget is not an absolute transactional maximum.
2. Verify that the Vercel team has available **Gateway Credits** and any required payment verification. Prefer a small prepaid balance or included credits where eligible. **Turn auto top-up OFF.** Avoid new recurring spend. Do not assume availability of free credits without checking.
3. Ensure the test key is **Gateway-funded, not BYOK**. Do not configure provider credentials for these requests and review existing Gateway BYOK settings to ensure they cannot be applied unexpectedly. BYOK provider costs do **not** count toward Gateway key budgets.
4. Store the one-time `AI_GATEWAY_API_KEY` value in a local secret manager; **do not paste it into chats, commits, tickets, browser client variables, GitHub Actions or Vercel production environment**.
5. Inspect current public model-list metadata and model endpoints. The `only` provider filter is a hard routing restriction, not a guarantee that the provider is currently available. Stop if the model lacks a suitable Groq endpoint.
6. In a local, manual **non-production**, **non-CI** shell with the credential loaded, explicitly set the attestations below only after confirming the underlying settings. These are **operator claims, not independent verification**:

```text
CAREERDEV_GATEWAY_SYNTHETIC_EVAL=true
CAREERDEV_GATEWAY_ENVIRONMENT=isolated-gateway-synthetic
CAREERDEV_GATEWAY_OWNER_APPROVED=true
CAREERDEV_GATEWAY_KEY_BUDGET_VERIFIED=true
CAREERDEV_GATEWAY_FUNDS_VERIFIED=true
CAREERDEV_GATEWAY_AUTOTOPUP_DISABLED=true
CAREERDEV_GATEWAY_NO_BYOK_VERIFIED=true
AI_GATEWAY_API_KEY=<one dedicated local secret, never written in code>
```

Run:

```sh
npm run evaluate:ai-gateway:synthetic
```

The script refuses CI, Vercel and production environments; if unconfigured, it exits with `HOLD` **before** making a network call. With verified configuration it sends **two sequential SDK requests**, for a single **fully fictional** profile, with `maxOutputTokens:160`, `maxRetries:0`, no model fallbacks, no tools and provider filters. **Gateway itself can attempt serving retries; inspect request attempts/cost in AI Gateway Logs before attributing costs.** It does not touch real CVs, subscriptions, production customer data or Supabase.

The output contains the two synthetic responses and measured local duration/token usage for human quality review. Do not claim it verifies real provider cost or exact serving model without checking Gateway Logs. The user should inspect the Logs ~90 seconds after the calls, including provider, model, actual routing attempts and dollar cost. Then delete/revoke the pilot key when testing is over.

**Stop on failure.** Do not retry with a production key, broaden provider filtering, or purchase credits automatically.

## Required pre-merge checks for DORMANT code

- All CI tests, secret audit, TypeScript, scope boundaries and production build succeed at the exact reviewed SHA.
- Production code diff remains limited to shared `package.json` / lockfile, CI and the isolated `lib/ai/pilot`, `scripts/test-ai-`, `scripts/run-ai-`, `scripts/report-ai-`, `docs/architecture` files.
- Confirm `main` integration does not overwrite the unrelated Calendly or billing changes. Production AI-agent path must remain OpenAI Direct; PR #42 release gates remain OFF.
- Preview deployment builds READY. Mark PR ready only when production code is inert and current main's new commits are reviewed. After merge, observe production deployment and inspect for errors. **Merging dormant modules is NOT a live Gateway rollout.**

## Distinct release-gate meanings

- **Gateway synthetic evaluation**: the standalone, manual, fictional-data evaluation can run when the *gateway key/budget/balance/BYOK/owner attestations* are truly verified. The 11-gate production-model integration ledger is not needed to conduct this independent test.
- **Production multi-provider agent routing**: still needs the full 11-gate evidence ledger, reconciled billing, entitlements, ownership, RLS, usage accounting, source grounding, quality, rollback and a separate owner deployment decision. Draft PR #43 does not authorize this.
- **Production billing**: Draft PR #42 is independent and must not be merged by this AI Gateway pilot task.

Docs: https://vercel.com/docs/ai-gateway/pricing, https://vercel.com/docs/ai-gateway/observability-and-spend/budgets, https://vercel.com/docs/ai-gateway/models-and-providers/provider-filtering-and-ordering.
