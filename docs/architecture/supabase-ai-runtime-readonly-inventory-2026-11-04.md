# Read-only Supabase AI runtime inventory — 4 November 2026

**Purpose:** Define the safe migration boundary for the OpenAI/Groq pilot in Draft PR #43.  
**Mode:** Read-only connector inspection. **No SQL, Edge Function deployment, environment-variable change, or production write.**

## Observed project inventory

| Environment | Project | Active Edge Functions observed | AI agent runtime |
|---|---|---:|---|
| Production | \`careerdev-global\` | 29 | \`careerdev-ai-agent-runtime\` version 25 |
| Separate AI test project | \`careerdevglobal-ai-test\` | 32 | \`careerdev-ai-agent-runtime\` version 2 |

Both environments report an active \`careerdev-ai-agent-runtime\`, but **version numbers are substantially different**. Version numbers alone do not prove functional drift; source was retrieved from each and is nonidentical. **Do not treat the test runtime as an exact production twin until the code and database contracts are compared line by line.**

## Source-level indicator scan

| Indicator | Production | Test |
|---|---|---|
| \`OPENAI_API_KEY\` reference | Present | Present |
| OpenAI API URL reference | Present | Present |
| \`GROQ_API_KEY\` reference | Not found | Not found |
| Groq API URL reference | Not found | Not found |
| Credit-reservation/finalization reference | Present | Present |
| Human-review guard reference | Present | Present |
| Execution-state transition reference | Present | Present |
| Web-search reference | Present | Present |

These are source-text indicators, **not evidence** of correctly functioning credits, model calls, review or external search.

The tracked \`main\` GitHub repository contains a Supabase coach-matching function using an embedded \`gte-small\` model; it does not currently provide the complete deployed AI agent runtime source under \`supabase/functions/careerdev-ai-agent-runtime/\`. This makes direct replacement of active AI behavior from a Next.js-only feature unsafe without a source-of-truth review.

## Safe integration implications

1. **Preserve runtime ownership:** Existing deployed Supabase AI functions continue to own their request authorization, subscription entitlement, credit accounting, state transitions and human-review gates until explicitly migrated and tested.
2. **Do not route existing Supabase AI traffic into the inactive Next.js pilot adapter.** The adapter currently has no client authorization, approved credit reservation/finalization hooks or production API endpoint by design.
3. **No automatic production provider fallback** until agent-specific OpenAI/Groq equivalence, prompt/schema compatibility, cost limits and idempotent credit tests pass.
4. **Reconcile the test runtime** to an explicitly approved authoritative source (not a blind copy of production with secrets/data); verify the test project's schema/RPC contracts and whether billing and external services are securely sandboxed.
5. **Keep production unchanged:** The proposed Vercel AI SDK adapter can serve future Next.js-managed AI flows, but existing Deno Edge Functions may require a separate, carefully audited provider abstraction or a secure server boundary. Avoid introducing two competing entitlement/credit systems.

## Required verification before a live Groq trial

- Recover exact production and test AI runtime source snapshots into an owner-reviewed source-of-truth branch without embedding secrets; compare source hashes and functional contracts.
- Audit specific model selection, OpenAI fetch, timeout, search, authorization, RPC, credit and human-review paths.
- Confirm isolated Supabase environment uses only test credentials, test billing plans, synthetic profiles and scoped service permissions.
- Install Vercel AI SDK and provider modules in a reproducible development checkout with a valid lockfile, then test against sandbox credentials.
- Record mock + live results, rate-limit and cost behavior, fallback response quality, and incident/rollback plan before any user traffic is shifted.

**Evidence boundary:** This report reflects a 4 November 2026 inspection through the connected Supabase project API. It is not a security audit certification and does not claim test/production parity.
