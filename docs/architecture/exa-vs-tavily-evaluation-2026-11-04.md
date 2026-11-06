# Exa vs Tavily — CareerDev Global Search Provider Pilot

**Date:** 2026-11-04  
**Status:** Desk research + repeatable test specification. **No API credentials or live search tests executed.**  
**Decision:** Evaluate **one search provider for activation**, not both in production.

## Relevant official capabilities

| Dimension | Exa | Tavily |
|---|---|---|
| Core search | Web search and retrieved content; supports published-date filters | Web search with topic/depth and optional date, country, domain and language controls |
| Employer research | Company-category search may suit employer discovery | General search plus domain filters for employer site verification |
| Job freshness | Returned publishedDate may help, but does not guarantee an opening is live | Published-date/time filters may help, but do not guarantee an opening is live |
| Free entry | Advertises $10 search credits per month (verify current terms) | Advertises 1,000 API credits/month (verify consumption rules) |
| Research evidence | Return URL, publisher/site, publication/retrieval dates, excerpt | Return URL, publisher/site, publication/retrieval dates, excerpt |
| Selection state | Undecided until equal-query tests | Undecided until equal-query tests |

**Sources:**
- Exa search API: https://exa.ai/docs/reference/search
- Exa pricing: https://exa.ai/pricing
- Tavily Search: https://docs.tavily.com/documentation/api-reference/endpoint/search
- Tavily pricing: https://www.tavily.com/pricing

## Evaluation dataset (synthetic searches only)

Use the same exact queries, result limit and same-day run window with each provider:

1. "Verified entry level data analyst openings Lagos Nigeria employer career pages this month"
2. "Human resources generalist role Abuja Nigeria company career site"
3. "Remote software QA analyst roles hiring globally official employer careers"
4. "Credential requirements project management professional Nigeria official PMI"
5. "In-demand cybersecurity skills Nigeria 2026 reputable labor-market sources"
6. "Graduate trainee programs in Nigeria currently accepting applications official careers"
7. "Publicly verifiable leadership-coaching professional credentials ICF"
8. "Employer official career pages for renewable energy graduate jobs South Africa"

## Score each provider out of 100

- **Grounding/source credibility (25)**: official employer, institution or government references preferred
- **Freshness (25)**: date present and opening/recommendation verified as still current
- **Relevance (20)**: matches role, market, seniority, skills and location
- **Result quality (15)**: working URLs, low duplicates, no spam or irrelevant pages
- **Cost + latency (15)**: actual billable API credits/dollars and p50/p95 response time

Only after running 8 matched-query cases on both providers should we nominate one for the pilot. Record per-query citations and grading by a human reviewer. Neither provider proves an employer has an open vacancy without checking the employer's current authoritative listing.

## Security and quality gates

- Development-only credential storage; never expose search API key or client CV contents.
- Search without personal data, with query length and result count bounded.
- Reject non-http(s) source URLs and private/internal network addresses when fetching; avoid blindly fetching untrusted user-supplied URLs.
- Normalize and deduplicate results, retaining source URL and retrievedAt. Record publishedAt only when provided by the source.
- Treat retrieved web content as untrusted; it cannot change authorization, prompt policy or system instructions.
- Require independent confirmation for up-to-date job applications, openings, licences, visa or compensation claims.
- Any future CareerDev Global AI search feature must enforce role/entitlement and credit controls before invoking providers.

## Acceptance evidence still missing

- Exa and Tavily test API keys configured in an isolated environment.
- Real API results, provider billing/credits, latency and quality scores.
- Authorized approval of one search provider.
- Audited integration with the actual AI agent runtime.
