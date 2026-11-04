# Paystack reliability execution — 3 November 2026

**Historical 3November snapshot; superseded by [4November current report](ai-billing-webhook-reliability-execution-2026-11-04.md).**

**Overall decision: PARTIALLY COMPLETE — BLOCKED.** Webhook acknowledgment is corrected and deployed only to the isolated TEST project. Draft PR42 must remain unmerged. No production release or gate activation is authorized.

## Implementation and verification

Audited parent: b0401aada123a5646f7055306ca1cc4c4bea44a9, branch `fix/ai-billing-lifecycle-safety-2026-11`, [Draft PR42](https://github.com/tolulopemakinde/careerdevglobal/pull/42). The commit containing this report includes the final source. Exact published SHA, CI run URLs and preview results are recorded in the execution receipt and PR after publication; earlier green CI is not substituted for that check.

Root cause: a signed, durably stored standalone charge had no marketplace order; v9 invoked a settlement RPC that correctly rejects null transaction_id, and returned503. v10 now confirms durable quarantine before200/processed:false. It retains invalid-HMAC rejection, raw-hash/event identity, exact attribution, processed-row concurrency protection, verified payment requirements and retryable infrastructure failures. Manual-review AI reversals and marketplace disputes are also durably retained before acknowledgment. There is no schema migration, policy activation, pricing change, or automatic reassignment of existing payments. See [the full status contract and operator runbook](ai-billing-webhook-acknowledgment-contract-2026-11.md).

Validation:

- Twelve of 24 shipped-webhook behavioral assertions failed before the fix; all24 pass after it. Final combined suite: **88 local tests pass**, including six new TEST-helper guards. Local tests inject storage/quarantine/correlation/provider failures; these are fault-injection tests, not real provider outages.
- **11 deployed synthetic HTTP assertions pass**: bad HMAC401, signed malformed JSON400, concurrent unmatched200/unprocessed/one row, conflicting content409/original hash, unmatched AI200, refund/dispute review200, matched AI invoice processed+duplicate without payment, matched marketplace failure processed+duplicate without funding. These are locally signed synthetic requests sent to the deployed handler, not Paystack-origin payments.
- **Six fresh read-only provider assertions pass**: original successful TEST transaction identity, refunded replacement's reversed TEST identity, both renewal stops, and already-processed partial/full refunds18971821/18972336. No refund was requested again.
- **Seven fresh deployed authorization/method/signature boundaries pass**: five privileged endpoints401 with anon bearer, webhook GET405 and invalid-HMAC POST401.
- Fresh rollback-only SQL:17 lifecycle/credit/RPC assertions,4 marketplace assertions,4 replacement assertions,2 profile boundaries; new rollback-only suspended-operator and disabled-refund-gate assertions complete without exception, plus2 actual authenticated-role cross-owner RLS checks pass. No refund gate was enabled, even temporarily. Earlier8 refund/dispute SQL groups and concurrency observations remain historical; rerunning their enabled-policy path is outside this task's gate constraint.
- TypeScript, source-secret audit, build inputs, authorization manifest, Phase2 boundaries and Edge security checks pass locally. Local dependency junction has Next16.4.0 while the lock pins16.4.3; clean-install build evidence must come from exact-commit CI/Vercel.

## Supabase and source parity

Only `yyevuwvtrktrzwuzeddo` was changed. Fetched bundles match reviewed local files after CRLF/trailing-newline normalization:

| Function | Version | JWT | Fetched matching files |
|---|---:|---|---:|
| careerdev-paystack-webhook |10|false; raw HMAC required|3|
| careerdev-ai-subscription-verify |5|true|2|
| careerdev-ai-billing-reconcile |4|true|3|
| careerdev-ai-subscription-checkout |5|true|2|
| careerdev-ai-subscription-manage |4|true|2|
| careerdev-ai-payment-adjustment |1|true|3|
| careerdev-ai-agent-runtime |2|true|1|
| billing-sandbox-acknowledgment |3|true; fixed TEST-only one-shot actions|2|

The existing `billing-sandbox-provider-delivery` remainsv4. New helper source is a `.ts.fixture` under tests, not a production endpoint. It requires the named project, sk_test_ credentials and both gates false, has fixed event/run identities, preserves uncertain claims, and cannot initialize a payment. Test helpers must never be deployed to production. Both self_service_enabled and refund-policy enabled remain **false**.

Hashes and files: [source parity](ai-billing-sandbox-source-parity-2026-11.json), [redacted execution evidence](ai-billing-webhook-acknowledgment-evidence-2026-11.json).

## Genuine provider delivery — still pending post-fix

The original standalone TEST payment6726807449 generated real Paystack event6aea261cc2ff06530f130f88 and six authenticated attempts to the exact isolated endpoint. Latest provider detail still says **Pending,503,trial_count6**, updated18:41UTC. Its one retained row effce232-de55-4b45-afa4-9316e632a252 remains failed/unassigned, with unchanged hash and no financial application. No genuine post-v10 redelivery200 is confirmed.

One documented provider resend was attempted after bounded safety validation (TEST identity/destination, no plan, no receipt/order/subscription linkage, original hash, both gates false). Its POST did not confirm success. Claim `billing-acknowledgment-20261103-a-resend_standalone` and failure `billing-acknowledgment-20261103-a-failure-91f6a3ff-c225-4cb3-81ab-3be02b185a16` are preserved; exact rejection/network result was not captured in helperv1. **Do not retry that uncertain action or manually re-sign the original payment.** Observe provider-controlled delivery or resolve the claim through a separately reviewed provider/operator action. The owner need not reconfigure the verified webhook URL.

## W01–W16 by evidence layer

PASS is limited to the named lower-layer invariant; it does not mean every scenario has a genuine provider/browser end-to-end pass. “Historical” is retained earlier evidence, not a fresh execution. A dash means no new evidence at that layer.

| ID / scenario | Status | Local | Database | Deployed endpoint | Genuine provider | Browser / remaining gap |
|---|---|---|---|---|---|---|
| W01 initial matched payment | BLOCKED | identity/plan/date guards pass | fresh rollback verified activation/one receipt | matched nonpayment invoice only; pending/no receipt | historical paid activation; fresh retained identity GET; standalone is unmatched | fresh matched client checkout/activation needed; separate payment approval |
| W02 concurrent duplicates | PASS (bounded) | concurrent unmatched pass | atomic receipt/idempotency assertions | two simultaneous unmatched200,one row,no settlement | prior six retries preserve one unmatched row; no concurrent paid charge | — |
| W03 insert before RPC interruption | PASS (bounded) | storage/provider failure paths pass | fresh seeded/interrupted event semantic deduplication | historical signed seeded replay; fresh one-shot claim retention | no new crash injection | — |
| W04 commit before HTTP interruption | PASS (bounded) | duplicate guards | fresh committed retry/one receipt | fresh matched synthetic invoice and marketplace duplicate200 | historical matched evidence; unmatched automatic retries | — |
| W05 cross-customer mismatch | PASS (bounded) | exact customer/reference/plan checks | fresh mismatch and actual-role cross-owner RLS denial | fresh unauthenticated401; historical owner checks | retained exact customer identity GET | no-session origin redirected to account chooser |
| W06 ambiguous code | PASS (bounded) | identifier conflict guards | fresh uniqueness rejection | historical signed conflict rejection | — | no shared customer/plan fallback |
| W07 wrong HMAC | PASS | no-insert assertion | no unauthorized financial delta | fresh401; signed malformed400 separately | earlier genuine HMAC accepted | — |
| W08 late payment after cancellation | BLOCKED | state model pass | fresh rollback late-charge safety | historical synthetic handling | actual late provider subscription payment not generated | provider-supported case/approval required |
| W09 older paid-through date | PASS (bounded) | valid date checks | fresh no-shortening/historical receipt checks | historical verified replay, not repeated now | retained transaction GET only | — |
| W10 failed then successful recurring renewal | BLOCKED | explicit lifecycle model pass | fresh synthetic sequence pass | no new real renewal | no supported controlled failed-then-success recurring run established | Paystack mechanism/outcome needed |
| W11 cancel in paid term | BLOCKED (partial evidence) | paid-term/terminal guards pass | fresh cancellation/deferred upgrade assertions | historical actual cancellation; current management bundle unchanged | fresh GET confirms both retained renewals stopped; no new cancellation | coach nonrenewing benefits/history visible; fresh client confirmation/final-bundle flow open |
| W12 expiry | BLOCKED | exact expiry/date tests | fresh expired-access denial | no new naturally expired session | historical time simulation is not natural expiry | no-session redirect passes; actual expired-session/natural-term browser checks open |
| W13 marketplace isolation | PASS (bounded) | collision/no wrong ledger | fresh marketplace success/refund/duplicate rollback | fresh synthetic failed marketplace event processed once; no funding | original standalone remains unassigned | pre-existing financial hashes unchanged |
| W14 unmatched lifecycle | PASS (bounded) | no provider/settlement call | fresh unmatched retention | fresh synthetic AI+marketplace200/unprocessed | original genuine unmatched is still old503/Pending | post-fix provider200 remains separate blocker |
| W15 missing/malformed dates | PASS (bounded) | provider normalization/date guards | fresh malformed date fail-closed | historical signed coverage | no malformed real invoice invented | — |
| W16 replacement upgrade | BLOCKED | current-selection and overlap guards pass | fresh4 rollback replacement assertions | historical earlier replacement; no new paid replacement | no new matched replacement charge | client post-replacement selection and natural eligibility flow open |

## Browser acceptance

Read-only on the existing isolated branch preview, preserving the coach and owner sessions:

- Coach desktop billing state refreshed; Fresher NGN7,500,25 remaining/0 used/0 reserved, nonrenewing paid through1December, verified history and disabled upgrades. Earlier desktop visual evidence retained.
- **Coach mobile visual passes now**,390x844 viewport/375 document width, readable card/wrapping, stopped-renewal text, disabled upgrade cards. Two new screenshots saved; viewport reset. This closes the previous unusable-mobile-screenshot gap.
- Separate preview origin without a session redirects `/account/ai-subscription` to `/account?next=/account/ai-subscription`; no billing data shown. This proves no-session handling, not an expired-session transition.
- Coach dashboard is **Applicant**, zero offerings/availability; it is not an approved-coach onboarding fixture. Calendly showed an Edge Function request failure in this isolated dashboard; no billing fix or integration change was made for that separate finding.
- Client desktop/mobile, approved-coach onboarding, cancellation confirmation, post-payment replacement and true expired-session acceptance remain blocked on suitable authenticated test sessions/fixtures and the billing gate. No existing session was invalidated and no coach approval was fabricated. Temporary tabs were closed.

## Financial integrity and retained fixtures

At the fresh baseline:9 receipts,10 subscriptions,3 credit-ledger rows. After authorized checks:9 receipts,11 subscriptions,3 credit-ledger rows. The only new subscription is a clearly tagged synthetic **pending nonpayment** fixture fd310d20-d1b7-48e2-99b9-37219571407a. One new synthetic marketplace failure transaction39d3ff3c-437b-4428-a999-044cc051cda8 is failed/blocked with one state-sync audit; it is not a Paystack transaction or funded balance. Its booking and fresh client fixture are retained and tagged. No new provider transaction, charge, refund or cancellation was initiated.

Excluding only these new fixture IDs (and their new marketplace sync row), whole-record hashes of every pre-existing subscription, receipt, credit row, marketplace transaction and marketplace sync record match the fresh baseline. Existing credits/receipts and paid periods are preserved; no negative balance, new paid entitlement or unauthorized allocation occurred. Both existing processed TEST refunds and renewal stops were freshly read from Paystack.

Earlier five database-only receipt fixtures remain identified separately from four historical provider-reference receipts. Four tagged containment fixtures and the earlier refund-race fixture were not deleted or reassigned. Prepared synthetic cancellation operation5dbf47a5-c13a-4d7e-afb1-033579664e6f remains untouched; do not reuse its account. Refund lots/usage/audit history remain preserved. At the snapshot,7 AI and2 marketplace events are not processed, including retained review/test rows and the original real unmatched charge; not all are failures or payable obligations.

## Database provenance and rehearsal

A fresh selected production/test catalog comparison was read-only. Among the selected objects:7 policies match exactly; test has11 additional columns (including9 receipt columns, runtime_claimed_at and payment_credit_lot_id),2 lot triggers and the lot foreign key. Index sets differ (10 test/12 production for the selected tables); six production indexes are absent from the isolated baseline, and webhook status-index definitions differ. Selected billing RPC bodies differ; AI receipt/reconciliation functions are absent from production. This is evidence of partial shape and intended branch changes, not an authoritative full schema.

Fresh migration histories show22 isolated entries. Lifecycle and marketplace correction bodies exist in the test catalog but their corresponding source migration names are **not recorded as separate history entries**. Refund policy is recorded20261103103049 versus source20261101152243; replacement is recorded20261103112714 versus source20261103112351. These provenance discrepancies are preserved rather than repaired by guessing. Production history ends with the existing Calendly fallback migration; it was not changed.

Only two Supabase projects exist; there is no separate disposable production-shaped rehearsal target. An authoritative schema-only export plus migration provenance is not available in this workspace. [Selected inventory](ai-billing-migration-rehearsal-inventory-2026-11.json) is not such an export.

Reproducible rehearsal once supplied:

1. Owner/maintainer supplies a Supabase CLI schema-only production export (no customer data), extensions/auth-reference prerequisites, grants/policies/triggers/functions/indexes and a reviewed migration-history manifest; supply a separate explicitly disposable project/database.
2. Hash/archive those inputs, restore only into the disposable target and verify its pre-change catalog against the export. Do not use the current test baseline as a substitute.
3. Apply source ordering: lifecycle20261101140853, marketplace statuses20261101151009, disabled reversal policy20261101152243, replacement20261103112351; reconcile earlier baseline prerequisites from provenance. Do not invent migration-history repair mappings.
4. Seed synthetic historical paid/expired/unattributed-credit cases, retain input hashes and run lifecycle/marketplace/overlap/RLS suites and migration-failure checkpoints. Never copy real customer rows or claim guessed lot attribution.
5. Verify fail-closed gate defaults, transactional rollback on a deliberately failed disposable migration, backup/restore recovery, historical-record hashes, constraints, dependency/index/policy parity and no duplicate receipts/credits. Restore/export the rehearsal target before retrying a non-idempotent migration; do not use DROP/CASCADE against production.
6. Refund/dispute SQL requiring policy activation remains unexecuted under the current explicit gate prohibition; obtain a separate scoped authorization before that part of rehearsal. Document disabled-policy behavior meanwhile.

## Remaining blockers and exact next action

| Missing | Why it matters | Owner / next action | Another TEST payment? |
|---|---|---|---|
| Genuine post-v10 acknowledged delivery | Synthetic200 is not provider acceptance | Paystack/operator: resolve uncertain resend claim or observe provider-controlled retry; inspect fixed event only; no URL reconfiguration needed | No |
| W01 matched paid activation and client flow | Complete payment-to-receipt-to-credits evidence | Owner: review [concrete checkout proposal](ai-billing-next-test-checkout-plan-2026-11.md) and separately approve oneNGN7,500 TEST payment plus its renewal stop; engineer must establish a reviewed gate-controlled path first | Yes, not yet initialized |
| W08/W10 recurring/late outcomes | Provider lifecycle cannot be inferred from DB simulation | Paystack/support: provide documented TEST recurring-failure/success and late-event controls, or wait approved provider schedule | Possibly; separately approved only |
| W11/W12/W16 browser/expiry/replacement | Existing GET and time simulation are insufficient | Owner/tester: suitable client and approved-coach sessions; naturally eligible term and actual expired session; engineer runs bounded UI checks | Replacement yes; other UI/expiry no |
| Adjudicated dispute winner/loser and reversal concurrency | Merchant decline is not a bank win | Paystack/support supplies TEST adjudication contract/evidence; owner separately authorizes gate-enabled policy testing/activation only after tests | No new payment necessarily; do not reissue refunds |
| Full schema provenance/rehearsal | Partial baseline cannot prove safe production migration | Maintainer supplies authoritative schema-only export/history and separate disposable target | No |
| Historical credit attribution / unresolved fixture operation | Cannot guess payment ownership or reuse blocked account | Owner/operator reviews approved attribution and separately resolves synthetic cancellation with audit; preserve all records | No |
| Marketplace unmatched attribution operations | Acknowledgment stops provider retries, so queue recovery must be owned | Maintainer assigns monitoring/operator and reviews audited exact-match recovery tooling; no direct binding of standalone probe | No |

[Paystack test-payment documentation](https://paystack.com/docs/payments/test-payments/) supplies successful/failed card scenarios. [Subscriptions](https://paystack.com/docs/payments/subscriptions/) describes scheduled invoices and failures, and [disputes](https://paystack.com/docs/payments/manage-disputes/) describes notifications/merchant responses. None of the reviewed pages established a supported deterministic failed-then-success recurring-renewal clock or bank-won adjudication simulator for this merchant. This is a documented investigation limit, not a claim those facilities never exist. Do not create a custom hourly plan or change approved pricing to simulate a monthly outcome.

Supabase preflight advisors were read before the change:6 security notices (1INFO/5WARN),5 performance notices (2INFO/3WARN). No new DDL/RLS object was introduced; these existing project findings are not silently described as resolved. Review remediation links in the evidence inventory before a broader release audit.

**Production safety:** no production database write, production Edge Function deployment, Paystack LIVE setting change, Vercel production deployment or GitHub merge was performed. Both gates remainfalse. No new payment/refund/cancellation was issued. The only provider write attempted was the documented, bounded resend of the unlinked TEST event; its uncertain outcome is retained.
