# AI billing: sandbox concurrency and reconciliation acceptance plan

**Status:** Original test specification, with historical audit notes below. For current executed results and release blockers, see [production readiness](ai-billing-production-readiness-2026-11.md) and [genuine Paystack TEST delivery evidence](ai-billing-provider-webhook-delivery-2026-11.md). Earlier read-only observations are retained for chronology and may have been superseded.

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
- **Historical contract concern (superseded):** The test RPC requires `verification_source`, `verified_payment`, and provider-verified Paystack payment evidence. Subsequent PR #42 source inspection confirmed the shared reconciliation path obtains and records `verified_payment` before applying a successful charge; later test deployment and reports supersede the initial assumption that verification was absent. Do not replace the stronger test RPC with the older review-only SQL proposal.
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

## 2026-11-03 updated evidence reconciliation (read-only)

**Supersedes the earlier Edge Function inventory note above:** A fresh Supabase inventory shows the test project now has deployed test versions of `careerdev-paystack-webhook`, `careerdev-ai-subscription-verify`, `careerdev-ai-billing-reconcile`, and dedicated sandbox test functions. The earlier claim that these were absent is stale.

The test project contains 17 recorded `ai_billing_test_runs` entries: successful runs for provider checks, paid lifecycle, concurrency, marketplace isolation, replacement verification, historical replay, partial refund, and full refund. These are historical recorded outcomes, **not rerun during this audit**. Earlier attempts include failures; do not erase or count them as passes.

Outstanding records:
- `billing-provider-events-refund-20261103-a` is **incomplete** because Paystack provider webhook delivery configuration evidence is missing; the actual test partial refund was requested, but processed provider-event verification was pending in that run.
- `billing-actual-full-refund-request-20261103-a` is **awaiting_provider**, with Paystack TEST refund pending at the time of that run; a separate later `billing-actual-full-refund-20261103-a` run is marked passed.
- `billing-replacement-20261103-a` is **awaiting_payment** in its original run; a later `billing-replacement-verify-20261103-c` run is marked passed. Earlier replacement verification attempts failed, including one failure to stop a new test renewal.
- `billing-paid-lifecycle-20261101-a` failed the old-plan/paid-through invariant; a later `-c` run is marked passed. Compare exact test assertions before concluding the regression is resolved.

Security: All three test-project RPCs `apply_ai_subscription_webhook_state`, `reconcile_ai_subscription_event`, and `apply_paystack_webhook_state` grant EXECUTE to service_role and deny anon/authenticated (catalog privilege inspection).

**Release remains blocked** pending explicit evidence of Paystack TEST webhook routing, mapping of each W01–W16 scenario to a successful isolated run, inspection of previously failed invariant assertions, and verification that the deployed test Edge Function sources correspond to PR #42. No test functions were invoked or payments created by this audit.

## 2026-11-03 exact deployed-source parity audit — read-only

**Release-blocking source drift confirmed** by comparing deployed Supabase Edge Function files to PR #42 branch source (normalizing CRLF to LF):

| Test deployment | Entrypoint | Shared modules |
|---|---|---|
| `careerdev-paystack-webhook` v7 | Differs: branch explicitly sets `verification_source:'webhook_hmac'`; deployed relies on DB default | Shared reconcile/provider modules identical after trimming trailing blank lines |
| `careerdev-ai-subscription-verify` v3 | Matches | Bundled provider module is older and lacks branch numeric transaction-ID safe-integer check |
| `careerdev-ai-billing-reconcile` v3 | Matches | Bundled reconcile module is older: chooses first transaction reference rather than rejecting conflicting references; provider module also lacks numeric-ID validation |

**Implication:** Historical passing test runs certify deployed snapshots, not the exact current PR #42 bundle. Before sign-off, deploy coherent bundles from one reviewed commit **to the test project only**, verify bundled source parity, and rerun critical provider, paid lifecycle, concurrency, marketplace, and replay tests. No production deployment authorized.

The comparison did not execute Edge Functions, modify database rows, or change Paystack configuration.

## 2026-11-03 authorized execution continuation

The later execution fetched `bd5a47c`, corrected sandbox bundle drift, and verified source after deployment. Final sandbox versions: webhook 9, verifier 5, reconcile 4, checkout 5, management 4; unchanged adjustment 1 and runtime 2. Payment access reporting and the marketplace-only column contract were corrected with failing-then-passing behavioral regressions. Final run `billing-source-parity-retest-20261103-d` passed 41 checks with one blocked provider-origin delivery check. Both billing gates are disabled.

See [the production-readiness report](ai-billing-production-readiness-2026-11.md) and [bundle/source hashes](ai-billing-sandbox-source-parity-2026-11.json). They supersede earlier inventory and pending-refund observations above, preserve historical failures and document the SQL fixture containment incident. Production remains unchanged; PR #42 stays draft and unmerged.
