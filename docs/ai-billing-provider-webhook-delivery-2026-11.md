# Paystack TEST webhook delivery — 3 November 2026

## Current evidence — 4 November 2026

**PARTIALLY COMPLETE — BLOCKED for production.** Genuine Paystack delivery of the original event now reports **Delivered / HTTP200 / attempt7** (3November21:07:36WAT), independently matched by webhookv10 Edge logs. The same signed event remains unassigned and unprocessed, with no financial mutation. No payment/refund/cancellation or resend was initiated during this resume.

The remote branch credit-security edits were preserved, its additive replay migration was completed from the deployed definition, and isolated database rehearsal plus seven post-apply authenticated-role checks pass. Source20261104122023 is recorded as TEST history20261104123708; current definition hashb9c0ffb6432e9f9da7d8010845df0e77 and ACL are verified. No production migration. Both gates remainfalse. All nine TEST bundles/20 files match reviewed source; final local suite102 passes. The earlier11 synthetic HTTP and six provider GET checks remain3November evidence. Six current local HTTP checks encountered transport errors rather than returning a result.

Read [the current full execution report with W01–W16 layers and owner actions](ai-billing-webhook-reliability-execution-2026-11-04.md), [fresh evidence](ai-billing-webhook-reliability-evidence-2026-11-04.json) and [acknowledgment contract](ai-billing-webhook-acknowledgment-contract-2026-11.md). W01/W08/W10/W11/W12/W16, client/approved-coach/expired-session acceptance, policy-enabled reversal tests and authoritative schema rehearsal still block production. Historical sections below retain earlier snapshots.


## 3 November acknowledgment continuation — historical snapshot

**PARTIALLY COMPLETE — BLOCKED.** Isolated webhookv10 now durably quarantines safe unmatched/manual-review events before HTTP200/processed:false. Invalid HMAC, conflicts and infrastructure/provider failures retain rejection/retry semantics. No schema change.88 local tests,11 deployed synthetic checks,6 fresh provider GET checks,7 endpoint boundaries and rollback-only SQL pass. Seven application bundles plus TEST helperv3 were fetched and match source. Both gates remainfalse.

The original genuine TEST event still reports Pending/503/six attempts; no post-fix provider200 is confirmed. One safety-checked documented resend did not confirm success; its uncertain claim is preserved and was not retried. No new charge/refund/cancellation was initiated. Coach mobile visual review now passes; client/approved-coach/true-expired-session acceptance and W01/W08/W10/W11/W12/W16 remain open. Existing financial hashes are unchanged, excluding only newly tagged nonpayment/failure fixtures.

Read [the current full execution report and W01–W16 layer matrix](ai-billing-webhook-reliability-execution-2026-11.md), [acknowledgment contract/operator recovery](ai-billing-webhook-acknowledgment-contract-2026-11.md), [redacted fresh evidence](ai-billing-webhook-acknowledgment-evidence-2026-11.json) and [proposed separately approved matched TEST checkout](ai-billing-next-test-checkout-plan-2026-11.md). Selected catalog comparison is not a production-shaped rehearsal. Historical sections below are retained; their503-by-design, mobile-capture and version9 notes describe earlier snapshots.


## Overall decision

**PARTIALLY COMPLETE — BLOCKED for production release. Genuine provider-to-Supabase delivery and safe standalone handling are verified.** This closes the earlier connectivity evidence gap. It does not establish a successful matched subscription activation, renewal, cancellation or replacement on the final bundles.

PR: [#42](https://github.com/tolulopemakinde/careerdevglobal/pull/42), branch `fix/ai-billing-lifecycle-safety-2026-11`. Starting head: `3ceb525b3600868e8815fd71104682ef131ada32`. The branch was fetched after restart and was clean before this work. Keep the PR draft and unmerged. Production was not modified.

## Configuration and merchant verification

Endpoint: `https://yyevuwvtrktrzwuzeddo.supabase.co/functions/v1/careerdev-paystack-webhook`.

- Owner confirmed this URL and relevant events were configured in TEST mode before the probe. Earlier empty history was not treated as a configuration fault.
- The provider event detail independently confirms TEST domain and this exact destination. The deployed webhook accepted its HMAC using the isolated secret. TEST configuration/routing is therefore verified by execution.
- Core function source parity was freshly checked: webhook **v9**, verifier **v5**, reconciliation **v4**, checkout **v5**, management **v4**. Webhook JWT remains false for provider callbacks; HMAC SHA512 remains mandatory. All other listed functions retain JWT verification.
- The probe is fixed to project `yyevuwvtrktrzwuzeddo` and a `sk_test_` secret. It authenticated the retained approved TEST payment and the new probe with that same secret. No secret was read out or exposed.
- The transaction verification response omitted the numeric merchant integration ID. The dashboard merchant display name/ID was not independently inspected after restart; owner configuration attestation, same-secret API access and provider HMAC/destination evidence are recorded separately from that limit.

## One bounded standalone TEST payment

| Property | Verified value |
|---|---|
| Reference | `CDG-WEBHOOK-TEST-20261103-86e31a7c0b2f4d99` |
| Provider transaction ID | `6726807449` |
| Amount/currency | NGN 100; 10,000 minor units |
| Provider domain/status | `test` / `success` |
| Created | 3 Nov 2026, 19:17:31 WAT (18:17:31 UTC) |
| Paid | 3 Nov 2026, 19:21:15 WAT (18:21:15 UTC) |
| Dedicated test customer | Exact disposable probe identity verified server-side; contact details omitted |
| Subscription plan | None; provider plan fields and standalone metadata verified |
| Local customer subscription links | Zero |
| Checkout completion | Owner completed the hosted TEST Success checkout |

The hosted [Initialize Transaction API](https://paystack.com/docs/api/transaction/) was used once with a durable claim recorded before the request. Reinvocation returns the existing record, including after an uncertain outcome. No AI checkout endpoint was bypassed, no plan/order was attached, and neither release gate was enabled. No raw-card API, second payment, refund request, provider cancellation or manual webhook resend was issued.

## Genuine event and delivery evidence

| Evidence | Actual result |
|---|---|
| Provider event | `charge.success`, `6aea261cc2ff06530f130f88` |
| Event created | 19:21:16 WAT (18:21:16 UTC) |
| Provider-recorded destination | Exact isolated endpoint above |
| Provider payload correlation | Exact reference, transaction ID, TEST domain, amount and currency match |
| Initial HTTP response | **503**; provider delivery status `Pending` |
| Initial provider trial count | 1 |
| Later observed trial count | **6**, latest provider update 19:41:00 WAT (18:41:00 UTC) |
| Stored event | `effce232-de55-4b45-afa4-9316e632a252` |
| Stored provider identity | `charge.success:6726807449` |
| Supabase received | 19:21:18.166092 WAT (18:21:18.166092 UTC) |
| Signature validation | `signature_verified=true` |
| Processing | `failed`, `transaction_id=null`, `processed_at=null`; retained for reconciliation |
| Edge log | POST webhook, v9, HTTP503 at 18:21:18.338 UTC; execution 1,820 ms |
| Duplicate behavior | Six provider attempts still correspond to one event row; no financial delta |

This evidence comes from Paystack's [Webhook Events API](https://paystack.com/docs/api/webhook-events/), the Supabase event row and bounded Edge log queries. It is not a runner-signed request. The probe does not sign or send requests to the webhook. Redacted machine evidence is in `docs/ai-billing-provider-webhook-delivery-2026-11.json`.

## Why the response is 503

HMAC verification succeeded. This standalone transaction deliberately has no AI or marketplace order linkage. The webhook routes the event to the marketplace event table with `transaction_id=null`; the existing service-only RPC rejects that state with `transaction_reference_required`. The handler retains the event and returns 503 with reconciliation required.

This proves connectivity and safe unmatched rejection, not successful business reconciliation or a `200 Delivered` event. No fabricated order or subscription was created to turn this probe into an activation test. HMAC, RLS and matching rules were not weakened, and the handler was not changed merely to return 200. Provider retries remain pending; observations show the actual attempt count rather than assuming a retry schedule from documentation.

## Database and financial integrity

| Record group | Before | After |
|---|---:|---:|
| AI payment receipts | 9 | 9 |
| AI subscriptions | 10 | 10 |
| Credit ledger rows | 3 | 3 |
| AI webhook events | 22 | 22 |
| Marketplace financial sync events | 4 | 4 |
| Marketplace webhook events | 4 | 5 |
| Billing gate | false | false |
| Refund policy gate | false | false |

Whole-record hashes of subscriptions, payment receipts, credits, marketplace transactions and marketplace financial sync rows match before/after. The only payment-processing addition is the unmatched signed event. No AI receipt or credit was allocated for the standalone payment. No existing payment history was changed.

The nine AI receipts must not be described as nine actual payments: four are tagged database simulations; one is the earlier `refund-race-20261103` database-only fixture; four carry the historical provider payment references. The fresh standalone payment is a provider transaction with no AI receipt. Historical provider-reference receipts were not all independently reverified in this continuation.

## Synthetic fixture review — no cleanup performed

| Reference | Current state | Attribution and interference |
|---|---|---|
| `refund-fixture` | expired | Two revoked credit lots; two usage rows retained |
| `refund-full-only` | expired | Two revoked credit lots; no usage rows |
| `CDG-AI-overlap1` | expired | One retained lot; no usage rows |
| `CDG-AI-overlap2` | expired | One retained lot; no usage rows; prepared cancellation operation remains |
| `refund-race-20261103` | earlier database-only subscription expired | One receipt and one usage row retained; original status was not guessed |

The open operation is `5dbf47a5-c13a-4d7e-afb1-033579664e6f`, linked to synthetic subscription `79fb3f80-b428-4d4b-9c95-fa67fa9beb6d`. It can interfere with reuse of that account, so the new standalone probe used a completely new Paystack customer and no CareerDev profile. No synthetic receipt, lot, operation or identity was altered/deleted.

## Tests and browser acceptance

- **74 local billing tests passed**, including six probe guards: TEST-only credentials/project, disabled billing and refund gates, durable uncertain-outcome claim and one bounded initialization without plan linkage.
- TypeScript, source-secret audit, build inputs and whitespace checks passed. Exact published-commit CI/build and preview outcomes are recorded in the PR and execution receipt; the local external dependency junction is not clean-install build evidence.
- Seven fresh deployed HTTP boundaries passed: five anonymous billing/operator endpoint 401 responses, webhook GET405 and invalid-HMAC POST401.
- Privileged reconciliation, adjustment, claim and settlement RPC grants remain service-only; anon/authenticated EXECUTE denied. No RLS or permission changes were made.
- Fresh authenticated coach read-only UI: Fresher NGN7,500, 25 remaining/zero used/zero reserved, paid through 1 December, renewal stopped, history shown, self-service changes unavailable. Upgrade buttons are disabled with the gate false.
- Desktop DOM measured 1,280 viewport / 1,265 document width. Mobile DOM measured 390 / 375, with the same account and disabled actions. Desktop screenshot passed visual review. Mobile screenshot capture was incomplete/unusable, so mobile visual signoff is not claimed. Temporary viewport override was reset and the temporary test tab closed.
- Full approved-coach onboarding, a fresh client/post-replacement flow and expired-session browser acceptance remain open. No current session was forcibly invalidated to simulate expiry.

## W01–W16 acceptance matrix

PASS is limited to the executed layer; no synthetic test is labelled provider end-to-end activation.

| ID | Status | Tested layer and outstanding requirement |
|---|---|---|
| W01 initial payment | BLOCKED | Genuine standalone provider delivery now passes. Matched subscription payment/activation on final bundles remains unexecuted with the gate disabled. |
| W02 concurrent duplicates | PASS | Existing signed concurrent tests; fresh automatic provider retries preserve one unmatched event. Provider retries do not establish concurrent paid credit-grant coverage. |
| W03 interruption before RPC | PASS | Existing seeded-snapshot/signed-HTTP test; no new crash injection. |
| W04 retry after commit | PASS | Existing committed-retry test; new provider retries also preserve unmatched state/financial hashes. |
| W05 cross-customer mismatch | PASS | Existing owner/identity guards and current local suite; no unauthorized attribution from the standalone customer. |
| W06 ambiguous code | PASS | Existing SQL uniqueness enforcement and current identity tests. |
| W07 invalid HMAC | PASS | Fresh deployed HTTP401 and local no-write assertion; genuine provider HMAC also accepted. |
| W08 late payment after cancellation | BLOCKED | SQL safety evidence retained; actual provider late subscription event not generated. |
| W09 older paid-through | PASS | Historical API-verified replay and SQL evidence retained; no period changes during the new probe. |
| W10 failed then successful renewal | BLOCKED | No actual recurring sequence; no additional charge or fabricated renewal was issued. |
| W11 cancel during paid term | BLOCKED | Historical provider confirmation plus fresh read-only stopped-state UI; new final-bundle cancellation not executed with the gate false. |
| W12 cancel after expiry | BLOCKED | SQL expiry evidence retained; natural expiry and expired-session browser scenario not completed. |
| W13 marketplace isolation | PASS | Fresh real unmatched provider event cannot fund an order; all marketplace financial hashes unchanged. Existing collision/unit tests pass. |
| W14 unmatched renewal | PASS | Earlier signed unmatched-invoice test retained; new genuine unmatched charge retained safely. This is not a real recurring invoice. |
| W15 malformed dates | PASS | Current synthetic provider-normalization and SQL boundary evidence; no malformed provider invoice fabricated. |
| W16 upgrade | BLOCKED | Earlier paid replacement plus current selection tests retained; new matched activation and client replacement browser flow remain open. |

## Implementation changes and limits

Application billing functions and schema were unchanged. Only the JWT-protected TEST helper `billing-sandbox-provider-delivery` was deployed, final **v4**, with source fetched and matched. Its source template and six guard tests are version controlled. No helper should be deployed to production.

Two helper inspection assumptions were corrected: merchant integration ID is optional in Verify Transaction responses, and marketplace event timestamps use `received_at`, not `created_at`. The first preflight stopped before a durable claim or provider initialization; the completed payment was initialized once. The initial observation failure did not create another payment. Observation records are append-only in `ai_billing_test_runs`.

## Remaining actions

1. Connectivity is complete; the owner does not need to reconfigure the verified TEST URL. The retained standalone event remains unmatched/Pending by design. Any future policy for acknowledging unmatched events needs an explicit audited contract; do not manually attach it to an order.
2. Owner/operator: separately authorize and execute matched subscription lifecycle/browser acceptance when appropriate. Current instructions keep both gates disabled and allow only this one new standalone payment; no additional paid subscription was created.
3. Paystack/support: provide supported recurring-failure/success, late-event and adjudicated-dispute TEST facilities/evidence. Only published supported capabilities may be counted; no fake success or bank-win state.
4. Maintainer: provide authoritative production schema provenance and a separate rehearsal environment, review historical attribution, and reconcile the retained synthetic account before reuse. No separate authoritative rehearsal target was available here.
5. Complete client, approved-coach, mobile visual and expired-session acceptance. Obtain separate production activation/release approval only after mandatory gates pass.

**Production database, Edge Functions, Vercel production and GitHub merge were not modified. Both release gates remain false.**
