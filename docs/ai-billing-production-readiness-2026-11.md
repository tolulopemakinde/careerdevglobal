# AI billing production readiness — 3 November 2026

## Executive summary

**BLOCKED — ACTION REQUIRED.** PR [#42](https://github.com/tolulopemakinde/careerdevglobal/pull/42) remains draft and unmerged on `fix/ai-billing-lifecycle-safety-2026-11`. Production was not modified. This execution fetched and fast-forwarded from `b7dbe7b` to the actual remote head `bd5a47c0041197b81b0150bf2406b9a101aa1f12` before work. GitHub reported no conflict with main `580032ffdb9cbff11c2b80bf1216cf35e9485529`.

The five core sandbox bundles now use coherent source, including their imported modules. Two additional defects were reproduced and fixed: payment verification reported access without consulting the gated reversal policy or paid-period start, and the HMAC provenance change attempted to insert an AI-only column into marketplace events. Regression tests failed before each correction and pass afterward. The earlier account-page replacement selection defect was already fixed upstream; those commits and tests were retained.

Remaining release risks are actual provider webhook routing, real recurring renewal outcomes, bank dispute evidence, production schema rehearsal and historical credit attribution, and complete authenticated browser coverage. Passing local/SQL/signed-HTTP checks do not establish those missing outcomes.

## Environment readiness and execution

- Both project identities were confirmed ACTIVE_HEALTHY: isolated `careerdevglobal-ai-test` / `yyevuwvtrktrzwuzeddo`; production `careerdev-global` / `ufmhrmzumqkjvaezrmxf`. Production queries were read-only.
- Initial local checkout was clean. Ten remote audit/fix commits were fast-forwarded before changes. Existing billing sources, shared modules, SQL migrations, tests and both relevant workflows were inspected.
- Paystack TEST authentication and API reachability passed on retained fixtures. Approved Starter remains NGN 15,000 monthly, 50 credits; the provider plan amount is 1,500,000 minor units. Neither pricing nor shared plans were changed.
- Isolated callback is the explicit HTTPS billing branch preview URL. Both retained provider subscriptions report renewals stopped.
- The documented webhook-events endpoint was queried with transaction category/resource filtering. The replacement transaction returned zero delivery events. This does not establish why delivery is absent or prove the merchant webhook setting is wrong.
- The browser control attempt did not establish a usable Paystack settings session. No dashboard settings were changed. The available Computer Use skill forbids automating authentication dialogs; owner intervention remains necessary if login is required.
- Billing and refund policy gates are disabled after testing. No new charge, refund request, provider cancellation or other provider write was issued during this continuation.

## Implementation and deployed versions

| Function | Sandbox version | JWT requirement | Source verification |
|---|---:|---|---|
| careerdev-paystack-webhook | 9 | false; HMAC required | Entry and both shared modules match |
| careerdev-ai-subscription-verify | 5 | true; owner authenticated | Entry and provider module match |
| careerdev-ai-billing-reconcile | 4 | true; active staff/admin | Entry and both shared modules match |
| careerdev-ai-subscription-checkout | 5 | true; gated | Entry and provider module match |
| careerdev-ai-subscription-manage | 4 | true; owner and gated | Entry and provider module match |
| careerdev-ai-payment-adjustment | 1, unchanged | true; active staff/admin and separate gate | Entry and shared modules matched during initial comparison |
| careerdev-ai-agent-runtime | 2, unchanged | true; ownership enforced | Entry matched during initial comparison |

CRLF/LF and trailing blank lines were normalized. Entrypoints, imports, pinned provider dependency, environment assumptions, RPC contracts, security guards and JWT settings were reviewed. Fetched deployments were compared after publication. Bundle and normalized source SHA-256 values are in `docs/ai-billing-sandbox-source-parity-2026-11.json`. Core billing source corresponds to the commit containing this report; unchanged bundles also match the audited parent.

No persistent schema migration was added or applied in this continuation. Existing test migration history contains the lifecycle, marketplace intent mapping, reversal policy and replacement overlap changes. The replacement migration history version is `20261103112714`, while the authoritative source file is `20261103112351_prevent_ai_replacement_overlap.sql`; this historical timestamp difference is documented, not concealed by inventing a second migration.

Changed paths in this execution:

- `supabase/functions/careerdev-ai-subscription-verify/index.ts`
- `supabase/functions/careerdev-paystack-webhook/index.ts`
- `tests/ai-subscription-source.test.mjs`
- `tests/ai-billing-webhook-source.test.mjs`
- `tests/ai-payment-adjustments.sql`
- `tests/ai-replacement-overlap.sql`
- `tests/ai-profile-boundaries.sql`
- `tests/helpers/ai-billing-sandbox-revalidation.ts.fixture` (test runner template; never a production function)
- `docs/ai-billing-sandbox-source-parity-2026-11.json`
- `docs/ai-billing-production-readiness-2026-11.md`
- `docs/ai-billing-sandbox-acceptance-2026-11.md`

## Testing and W01–W16

Statuses qualify the stated execution layer. BLOCKED means the full release requirement remains open even where lower-layer checks passed. No fabricated provider success is counted.

| ID | Status | Evidence and remaining limit |
|---|---|---|
| W01 initial payment | BLOCKED | Historical actual TEST activation/credits passed; original transaction/invoice identity freshly reverified. Fresh provider-origin delivery and new activation on final bundles remain open. |
| W02 concurrent duplicate delivery | PASS | Fresh concurrent signed HTTP requests: two safe responses, one event and explicit webhook_hmac provenance; no receipt/credit delta. These are runner-signed events. |
| W03 interruption before reconciliation | PASS | Fresh signed HTTP retry processes a deliberately seeded pre-RPC event snapshot. This simulates interrupted state; it does not crash the production worker. |
| W04 retry after commit | PASS | Fresh HTTP retry reports duplicate; committed event/receipt counts remain unchanged. A lost response is simulated by retry. |
| W05 cross-customer mismatch | PASS | New client and coach sessions cannot verify another owner's payment; conflicting reference/code HTTP rejection and SQL identity guards pass. |
| W06 ambiguous subscription code | PASS | Isolated unique constraint rejects a duplicate provider subscription code; no ambiguous match is selected. |
| W07 invalid HMAC | PASS | Deployed webhook returns 401; no corresponding event exists. |
| W08 late payment after cancellation | BLOCKED | SQL terminal-state and overlap guards pass; provider-origin late-payment case remains outstanding. |
| W09 older paid-through date | PASS | SQL rejects shortening; fresh signed historical charge reverified with Paystack does not restore the simulated expired old term or alter the replacement. |
| W10 failed then successful renewal | BLOCKED | SQL transitions pass. Actual Paystack failed/successful recurring invoices and final credit allocation remain unexecuted. |
| W11 cancel active paid term | BLOCKED | Historical actual TEST cancellation preserved term/credits; fresh GET confirms renewals remain stopped. New cancellation on final bundles/provider-origin confirmation remains open. |
| W12 cancel after term | BLOCKED | SQL cancellation/expiry and deployed old-payment no-access check pass. Natural expiry and expired-session browser acceptance remain open. |
| W13 AI/marketplace reference collision | PASS | Behavioral collision fails closed; SQL marketplace assertions pass. Fresh retained marketplace replay validates final deployed insert contract without issuing new payment signals or changing its ledger. |
| W14 unmatched renewal | PASS | Fresh signed unmatched event returns reconciliation required, retained unmatched with no subscription assignment. Not a real recurring invoice. |
| W15 malformed/missing dates | PASS | Provider normalizer and SQL malformed-date rollback pass. Boundary checks are synthetic; no real provider malformed invoice was invented. |
| W16 upgrade | BLOCKED | Actual historical replacement payment/50-credit check passed after explicit local expiry simulation. Fresh overlap/replay SQL and upstream selection tests pass; natural expiry, fresh final-bundle replacement and browser flow remain open. |

Automated billing suite: **68 passed**, including four new verifier behavior tests. TypeScript, source-secret audit, build-input check, authorization manifest, Phase 2/3 boundaries, Edge security module, Phase 4 simulation and whitespace checks passed. There is no lint script in package.json.

Fresh database checks: 17 billing assertions, 8 refund/dispute groups, 4 replacement assertions, 4 marketplace assertions and 2 profile boundaries passed. Refund/replacement/profile scripts now carry their own BEGIN/ROLLBACK. Before/after snapshot checks verified unchanged receipt, subscription, adjustment and credit-row counts and disabled gates for the corrected rollback runs. The original pre-correction replacement run was a SQL test, not a provider transaction.

Fresh deployed test run `billing-source-parity-retest-20261103-c`: 38 checks passed, one provider-delivery gate blocked. Final run `billing-source-parity-retest-20261103-d` on webhook v9 passed **41 checks**, including retained marketplace replay, with **one blocked provider-delivery check** and zero failed assertions. Each distinct run is append-only; earlier failures remain visible. The runner is fixed to the isolated project and sk_test_ keys, ignores caller-selected fixture input, and suspends/bans newly created operator/client/coach test identities afterward.

Local npm build cannot be certified: the Windows npm launcher arrangement failed, and direct Next build failed on the external node_modules junction. That junction contains Next 16.4.0 while the committed lock pins 16.4.3, so it is not clean-install build evidence. The audited parent CI source/types/build and Vercel preview passed. Exact new-commit clean-install CI and preview must be checked separately and are recorded in the execution receipt.

## Historical failures and refund findings

- Paid lifecycle `20261101-a` failed the old-plan/paid-through assertion; `-c` keeps the plan/status assertion but compares parsed instants. Current v3 runner source and the earlier execution narrative show a timestamp-normalization assertion correction, not an entitlement implementation fix. The exact original v1 source was not recovered, so a stronger before/after assertion claim is unwarranted.
- Replacement `20261103-a` failed verification; `-b` verified credits but could not stop the replacement renewal. The overlap migration excludes expired history, prevents old receipt reactivation and selects the current record for cancellation. Four fresh SQL assertions pass, historical `-c` records 9 passes, and fresh provider GET confirms both renewals remain stopped. No assertion was weakened to permit overlapping terms.
- Partial refund 18971821 (300,000 minor units) and remainder 18972336 (1,200,000) are freshly confirmed processed TEST refunds. The separate full-refund run passed five checks. A fresh privileged adjustment replay is idempotent and customer credits remain zero. Paystack now reports the replacement transaction reversed; the verifier returns reconciliation required without active access.
- `billing-provider-events-refund-20261103-a` and `billing-actual-full-refund-request-20261103-a` remain historical incomplete/pending records. They are not reasons to reissue a refund. No refund was re-requested.
- These refund checks establish provider API verification and operator reconciliation. They do not establish provider-origin refund webhook delivery or automatic policy activation.

## Financial integrity and test containment

Real Paystack receipts retain exact transaction/reference, amount/currency, customer/plan and invoice attribution. Duplicate identities are absent; retries did not create receipts or credit usage. Historical usage is retained. Full refunds revoke unused funded lots, partial refunds preserve benefits pending review, and dispute SQL prevents frozen consumption, negative balances, duplicate adjustments and conflicting final outcomes.

An execution error must remain visible: the initial refund and replacement SQL files required an external rollback wrapper, but were invoked without it. Four new synthetic receipts and related fixtures persisted, and replacement isolation expired one pre-existing database-only fixture. The two actual Paystack subscription records, their periods and receipts were unaffected. New synthetic subscriptions were subsequently marked expired and tagged database_simulation_fixture; all synthetic records and results were preserved. No real provider transaction was created for them. Containment is recorded as `billing-fixture-containment-20261103-a`.

The pre-existing database-only fixture `e515376f-bbac-4885-a9dd-69a98a65b568` remains expired because its previous status was not captured; no guessed restoration was performed. Its pending synthetic cancellation claim remains separate from customer provider operations. This fixture needs reconciliation before reuse. A repeat failed on that outstanding operation; the corrected rollback test chooses an account without an open operation and passes. Current total receipt counts include these four retained simulation receipts and must never be reported as nine actual provider payments.

The earlier `-a` revalidation stopped when the now-refunded transaction was no longer successful; `-b` passed its financial checks but used an incorrect event-list route. Both failures are retained. The correct documented endpoint was then used in `-c` and `-d` ([Paystack Webhook Events API](https://paystack.com/docs/api/webhook-events/)). A temporarily empty test-runner deployment caused an idle timeout; its source was corrected and fetched again. Core application functions were not empty. Only final verified bundles count as current evidence.

## Security review

RLS is enabled on receipts, operations, credit ledger/lots, adjustments and reconciliation audit. Catalog checks deny anon/authenticated EXECUTE on webhook mutation, reconciliation, adjustment, runtime claim and settlement RPCs; service_role is allowed. Customer ownership and active profile roles are enforced in endpoints. Suspended operators are denied with their existing token. User role/status self-promotion is blocked. Service-only tables intentionally have no customer policy.

HMAC SHA512, exact reference/code checks, safe numeric transaction IDs, exact invoice transaction correlation, amount in minor units, currency, customer, plan, mode and date checks remain enforced. Marketplace provenance now respects its actual table contract; the production column absence was confirmed read-only. Neither RLS nor provider verification was relaxed.

Advisors still report baseline findings, including public function EXECUTE warnings, mutable search paths on unrelated functions, extensions in public and leaked-password protection disabled. Some authenticated RPCs intentionally use SECURITY DEFINER with ownership/auth checks. No whole-project clean-security claim is made; broad baseline remediation is outside this scoped billing change.

## Production preparation — plan only

1. Obtain a provenance-safe production schema baseline, reconcile dependencies/policies/triggers and rehearse on a separate production-shaped database. Do not guess missing DDL or replay all historical migrations blindly.
2. Review the existing authoritative migration order: `20261101140853_ai_billing_lifecycle_safety.sql`, `20261101151009_fix_marketplace_intent_webhook_statuses.sql`, `20261101152243_ai_payment_refund_chargeback_policy.sql`, `20261103112351_prevent_ai_replacement_overlap.sql`. Keep both gates false and review historical attribution before enabling policy. Resolve migration-history timestamps through provenance review.
3. After a separate owner release authorization, deploy coherent backend bundles: runtime/security dependencies and operator endpoints, then webhook, verifier, checkout/manage, and finally compatible UI. Preserve existing JWT/HMAC settings. Never deploy this acceptance runner to production.
4. Configure production-owned credentials and callback separately; TEST credentials/project URLs must never be copied into production. Confirm pricing/plan currency and live callback/webhook in an owner-controlled release procedure.
5. Smoke-test ownership/401/403, checkout gating, exact verification, duplicate events, cancel/access expiry, balances and marketplace isolation with explicitly authorized production smoke scope. A successful build alone is insufficient.
6. Monitor failed/unmatched events, provider delivery failures, open operation claims, signature rejects, duplicate conflicts, receipt/credit deltas and adjustment review queues. Assign an operator and response target before activation.
7. Rollback: disable new billing actions first; preserve receipts/events/usage/audit and compatible security fixes. Reconcile uncertain provider operations before retrying. Do not delete ledger records or restore unsafe mutation grants/triggers. Any later rollback/release still requires owner authorization.

## Exact remaining actions

1. Owner: open Paystack TEST developer API/webhook configuration, verify the merchant workspace, and set/confirm `https://yyevuwvtrktrzwuzeddo.supabase.co/functions/v1/careerdev-paystack-webhook`. Leave LIVE settings unchanged. Provide authenticated dashboard access if further help is desired; authentication dialogs must be completed by the owner. Then capture a provider-origin delivery and its destination/response, using an explicitly isolated event.
2. Owner/provider support: supply a supported TEST recurring-failure/success and dispute/adjudicated-win exercise or approved evidence contract. No fake bank win, fake successful payment or clock-based renewal claim is acceptable.
3. Owner/maintainer: provide authoritative schema export/provenance and a separate rehearsal target; resolve historical credit attribution and the retained database-only fixture before reuse.
4. Complete expired-session, approved-coach and post-replacement desktop/mobile browser checks on final source. Browser authentication and any required TEST checkout must be completed through authorized controls.
5. Only after mandatory gates pass, obtain separate production refund-policy activation and release approval. This task does not authorize merge or production deployment.

**Final recommendation: BLOCKED — ACTION REQUIRED. No production database changes, Edge Function deployments, Vercel production deployments or merge occurred.**
