# AI billing: sandbox concurrency and reconciliation acceptance plan

**Status:** Test specification only; not an execution report.

## Prerequisites
- Disposable Supabase project with the exact production schema copied without customer data.
- Paystack test-mode account, test plan codes, and test-mode webhook secret. Never mix production and test credentials.
- Apply and verify `docs/sql/ai-subscription-atomic-webhook-proposal.sql` **only in the disposable project**.
- Deploy draft webhook to disposable project with test secrets. Do not point production Paystack webhook to it.
- Create two independent test customers, two distinct subscriptions, and one marketplace test payment.

## Cases and expected outcomes
| ID | Scenario | Expected result |
|---|---|---|
| W01 | Valid initial charge with matching transaction reference | One subscription activated; event processed once |
| W02 | Two identical signed deliveries concurrently | One event record; one state transition; both eventually acknowledged or safely retried |
| W03 | Retry after event insert but before RPC | Original event ID replayed and processed |
| W04 | Retry after RPC commit but before HTTP response | Duplicate reports processed, without new credit grant |
| W05 | Event references another customer's subscription code | Rejected; no cross-customer state mutation |
| W06 | Ambiguous subscription code | Rejected; event retained for reconciliation |
| W07 | Wrong HMAC signature | 401; no event inserted |
| W08 | Late payment after cancellation | No reactivation |
| W09 | Older next_payment_date | Existing paid-through date not shortened |
| W10 | Failed renewal, then verified successful renewal | State follows explicit policy; no duplicate credit grant |
| W11 | Cancel during paid term | Status non_renewing; entitlement until verified end |
| W12 | Cancel after paid term | No further paid entitlement |
| W13 | AI and marketplace event share a reference | Fail closed; no wrong ledger mutation |
| W14 | Unmatched renewal event | Retained for reconciliation, not assigned by shared plan/customer code |
| W15 | Missing provider date / malformed date | Fail closed or remain pending under explicit policy |
| W16 | Subscription upgrade attempt | No overlapping Paystack subscription charges; no entitlement before verified payment |

## Evidence required
Record redacted provider event ID, event status, subscription status, paid-through date, credit-ledger delta, and expected vs actual outcome for each case. Do not store Paystack secrets, customer email, or raw payment details in test artifacts.

## Release gates
1. Execute tests W01-W16 against disposable infrastructure, document results and failures.
2. Validate service-role authorization and verify authenticated users cannot call reconciliation RPC.
3. Ensure payment event ledger and AI credit grant are idempotent **within one transaction**, or separately demonstrate a safe exactly-once grant path.
4. Confirm marketplace regressions, UI cancellation/upgrade paths, and build checks.
5. Require explicit owner approval before production migration, Edge Function deployment, or UI activation.
