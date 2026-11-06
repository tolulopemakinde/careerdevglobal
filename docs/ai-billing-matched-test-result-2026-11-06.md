# Paystack matched TEST result — 6 November 2026

**PARTIALLY COMPLETE — BLOCKED for production.** The owner-approved Fresher monthly TEST payment and its renewal stop passed in isolated Supabase project `yyevuwvtrktrzwuzeddo`. This closes the provider and backend portions of W01 and W11. Authenticated client and approved-coach browser acceptance remains open.

| Evidence | Observed result |
| --- | --- |
| Approved checkout | One confirmed checkout for one new disposable account. Paystack transaction `6734777802` was TEST, successful, and exactly NGN 7,500. |
| Provider webhook | Paystack event `6aed27f7195a93c4579db7d8` reported Delivered, HTTP 200, attempt 1. Its destination, transaction and payload reference matched. The database recorded one processed, HMAC-verified `charge.success` event. |
| Receipt and access | One receipt matched the exact transaction, reference, subscription, amount and currency. Verified paid access was active. The provider API verification record is tracked separately from the signed event. |
| Renewal stop | One confirmed cancellation. Paystack reported renewal stopped, and CareerDev recorded `non_renewing`. The paid interval stayed 6 November 02:00 to 6 December 02:04:59 WAT. A subsequent authenticated SQL-role read showed 25 of 25 credits available, with zero consumed or reserved. |
| Financial scope | Total receipts moved from 9 to 10, subscriptions from 11 to 12 and usage rows stayed at 3. The two new confirmed operations were owned by the dedicated fixture. The private authorization was closed, leaving zero enabled scopes. Both global gates stayed disabled. |

The callback browser used a different authenticated account from the dedicated checkout owner. Isolated Edge logs recorded HTTP 404 for that browser request and HTTP 200 for verification under the checkout owner. The pricing page now handles authentication and ownership responses with sign-in guidance. It keeps the return link for retries and explains pending and unavailable states. Server-side ownership enforcement remains in effect. Nine local callback cases passed, including wrong account, expired or missing authentication, retryable errors, and a successful return.

The reviewed test path was published at `7ef525ca2fac1675572db186fb7e74b90f21f105`. [GitHub billing CI](https://github.com/tolulopemakinde/careerdevglobal/actions/runs/42139507066) passed 144 tests and the disposable PostgreSQL integration. Vercel built that commit with Next.js 16.4.3 and the callback alias pointed at its READY preview. Local TypeScript and source and boundary checks passed. GitHub did not schedule the separate Phase 1 workflow for that push. Checkout v6, management v5 and runner v4 matched the reviewed sources. Webhook v10 handled the delivery.

The earlier standalone event still demonstrates quarantine. A valid unmatched charge previously reached settlement without a transaction ID and returned HTTP 503. The corrected handler acknowledges durable quarantine with HTTP 200 while preserving invalid signature, malformed payload, conflict and retryable infrastructure responses. The original provider event reached HTTP 200 on attempt 7 and remained unassigned. [Acknowledgment contract](ai-billing-webhook-acknowledgment-contract-2026-11.md)

The [prior W01–W16 evidence matrix](ai-billing-webhook-reliability-execution-2026-11-04.md) retains the local, database, endpoint, provider and browser results for each case. The matched TEST run adds the following evidence and leaves the listed production gaps.

| Scenario | Current decision |
| --- | --- |
| W01 initial payment | Provider, isolated database and backend pass. Signed-in checkout-owner browser acceptance is open. |
| W02 concurrent duplicates | Bounded pass. The genuine webhook and verifier converged on one receipt. Concurrent duplicate processing remains supported by earlier synthetic tests. |
| W03 interrupted before RPC | Bounded pass from automated and rollback retry checks. |
| W04 committed before response | Bounded pass from replay and committed retry checks. |
| W05 customer mismatch | Bounded pass. The new browser attempt from a different owner was denied with HTTP 404. |
| W06 ambiguous code | Bounded pass from exact identity and database uniqueness checks. |
| W07 wrong HMAC | Pass from prior deployed rejection. The new genuine signed event processed successfully. |
| W08 late charge after cancel | Blocked on a genuine provider-controlled TEST event. |
| W09 old paid-through date | Bounded pass from date and receipt checks. |
| W10 failed then successful renewal | Blocked on a documented Paystack TEST sequence or a separately approved observation plan. |
| W11 cancel during paid term | Provider, isolated database and backend pass. Browser acceptance is open. |
| W12 expiry | Blocked on natural term expiry and an actual expired browser session. |
| W13 marketplace isolation | Bounded pass from prior rollback and standalone quarantine evidence. |
| W14 unmatched event | Pass for genuine standalone quarantine. A provider-origin unmatched recurring invoice remains open. |
| W15 malformed dates | Bounded pass from local guards and rollback checks. |
| W16 replacement | Blocked on natural eligibility, a separately approved replacement payment and the client browser flow. |

The tester needs isolated client and approved-coach sessions for browser acceptance. An authorized owner must supply a production schema export with provenance and a separate rehearsal target. Paystack support or the owner must provide a documented TEST renewal and dispute path before those provider cases can run. Refund and chargeback activation still requires owner approval and the mandatory billing security checks. The draft pull request remains unmerged. Production database, Edge Functions, Paystack LIVE configuration and Vercel production deployment were not modified.
