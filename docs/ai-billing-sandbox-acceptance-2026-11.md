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

## 2026-11-03 infrastructure discovery — READ ONLY

- Two Supabase projects were enumerated: production `careerdev-global` (`ufmhrmzumqkjvaezrmxf`) and separate `careerdevglobal-ai-test` (`yyevuwvtrktrzwuzeddo`). Both active. **Do not assume the latter is disposable.**
- The test project already contains 6 AI subscriptions (1 active, 4 non_renewing, 1 pending) and 6 recorded webhook events. Do not delete or mutate these records.
- Test project already has a more advanced `public.apply_ai_subscription_webhook_state(uuid)` SECURITY DEFINER function. Anonymous and authenticated roles have no EXECUTE privilege (verified read-only).
- **Critical contract mismatch:** The existing test RPC requires `verification_source`, `verified_payment`, and a provider-verified Paystack payment record for successful charges; the PR #42 webhook currently inserts only `signature_verified`, event payload, and identifiers. The PR's review-only SQL proposal is less restrictive than the existing test RPC. Do not overwrite the test RPC with the proposal or deploy the current webhook unchanged.
- The existing test RPC also references `ai_subscription_payments` and enforces amount/currency/plan/paid-period checks; the PR proposal lacks equivalent controls. Adopt the stronger verified-payment model after a complete contract audit, rather than downgrading protections.
- Paystack test-secret presence and test-mode webhook routing have not been verified. Do not print or request raw secrets in chat.
- No database write, Edge Function deployment, provider charge, or live webhook delivery was executed in this audit. W01–W16 remain pending integration execution; passing GitHub source tests do not count as sandbox acceptance.

### Next safe work
1. Inspect test RPC, payment ledger schema, Edge Function code, and repository branch contracts in full (read-only).
2. Reconcile PR webhook with provider verification requirements and idempotent credit grant, using source-only changes in PR #42.
3. Execute isolated tests only after establishing ownership of existing test records and test-only credentials; preserve all six subscriptions and six events.
