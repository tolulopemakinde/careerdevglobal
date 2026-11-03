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

## 2026-11-03 additional read-only verification

- PR head `65b70e799041287b1abd72d1f498cd68a3276138`: GitHub source/types/build and both test checks completed successfully.
- On the separate Supabase test project, `service_role` has EXECUTE while `anon` and `authenticated` do not, for `apply_ai_subscription_webhook_state(uuid)`, `reconcile_ai_subscription_event(uuid,uuid,text)`, and `apply_paystack_webhook_state(uuid)`.
- All six existing AI webhook events are already processed: five `charge.success`, one `invoice.create`. There are no existing failed/unmatched events to replay without creating isolated fixtures.
- The `ai_subscription_payments` ledger contains provider transaction ID, reference, amount_minor, currency, paid_at, period_start, and period_end. It is present in test; 5 rows were observed in the preceding audit.
- No payment credentials or provider webhook routing were inspected. The database was queried read-only; no integration payment or mutation test was performed.
- Release remains gated on controlled fixture creation, test-only Paystack routing, concurrent delivery, and exactly-once credit/entitlement verification.

## 2026-11-03 Paystack sandbox deployment preflight — read-only

- Existing test Edge Function `pilot-paystack-sandbox-preflight` (version 3) is active, JWT-protected, and checks the Supabase project hostname against `yyevuwvtrktrzwuzeddo.supabase.co`.
- The preflight requires an authenticated active staff/admin profile and a `PAYSTACK_SECRET_KEY` starting with `sk_test_`. It calls Paystack's test-mode `GET /plan?perPage=1` endpoint and reports boolean authentication/reachability results without exposing the secret.
- **Preflight was inspected, not invoked**: no authenticated staff token was available to this audit, so actual secret presence, provider authentication, and network reachability remain unverified.
- The test project's Edge Function inventory does not include `careerdev-paystack-webhook`, `careerdev-ai-subscription-verify`, or `careerdev-ai-billing-reconcile`. Consequently W01–W16 cannot yet be considered end-to-end tested in this environment.
- Deployment order once test-only credentials and authorization are confirmed: (1) validate existing test database function contracts; (2) deploy branch billing functions **to the test project only**; (3) run authenticated preflight; (4) configure a test-only webhook route without altering production Paystack settings; (5) create fresh isolated test identities; (6) execute W01–W16 and capture redacted evidence.
- Existing test subscriptions, events, and provider configuration must not be overwritten or reused as fixtures. No Edge Function was deployed in this audit.
