# Paystack webhook reliability execution — 4 November 2026

**Overall decision: PARTIALLY COMPLETE — BLOCKED for production.** Genuine provider acknowledgment now passes. The credit replay binding defect is fixed and tested in the isolated database. Draft PR42 stays unmerged; the remaining payment, browser, refund-policy and schema-rehearsal gates below still apply.

## GitHub and publication

[Draft PR42](https://github.com/tolulopemakinde/careerdevglobal/pull/42), branch `fix/ai-billing-lifecycle-safety-2026-11`. The resumed work integrated remote parent `dbb40ee2a3efbb31eface7a635bbd83bb65b972d`, preserving the intervening credit-security commits and revised historical acceptance notes. The remote disposable PostgreSQL integration job, SQL cases and removal of its one-time write-enabled workflow were also retained. A backup stash d65d876251a776a174a7a74d81ecef1571bd53e5 retains the pre-resume local work. Exact published SHA, CI and preview results are recorded in the final execution receipt and PR after publication; prior b0401aa CI is not evidence for the new commit.

Changes include the webhook entrypoint; webhook/helper/credit replay regressions; the additive credit migration and database fixture; acknowledgment and operator contract; current evidence/parity/readiness/delivery/acceptance/release reports; selected migration inventory; and the proposed separately approved next checkout. No second PR, merge or production deployment is authorized.

## Webhook reliability and genuine provider evidence

Root cause: v9 persisted the standalone signed charge, found no business order, then called a marketplace settlement RPC with null transaction_id. The RPC correctly rejected it, but the handler returned503 and caused unnecessary delivery retries.

v10 separates acceptance from settlement. It confirms a durable review state before returning HTTP200 with processed:false/reconciliation_required:true for safely unmatched or manual-review events. It preserves raw-body HMAC-SHA512, exact identity/ownership, receipt uniqueness, hash-conflict rejection, paid-payment verification and retryable storage/provider failures. A concurrent processed event cannot be downgraded. No webhook table or status CHECK changed; marketplace uses its existing verified state plus an explicit review reason.

**Fresh Paystack GET now reports Delivered / HTTP200 / attempt7** for original TEST event `6aea261cc2ff06530f130f88`, transaction `6726807449`. Its provider timestamp is **3 November 20:07:36 UTC (21:07:36 WAT)**. Supabase Edge logs independently show POST200 at20:07:36.221UTC on webhookv10. The exact isolated endpoint and payload identity match. The same original row effce232-de55-4b45-afa4-9316e632a252 has signature_verified=true, transaction_id=null, processing_status=verified, processed_at=null and unchanged hash09b372109a25f8b8f731df171f8aac74ea48f50128e593df7987ba5bba1f57d3. One event remains financially unapplied; no paid subscription, credits or marketplace funding resulted.

Earlier six503 attempts and the safety-checked resend request remain historical evidence. The resend POST did not confirm its outcome; that durable claim and failure record remain preserved. The delivery record does not distinguish an automatic retry from a delivery caused by that earlier uncertain request. We therefore claim **provider-origin redelivery**, not a proven resend mechanism. No resend was repeated and no new payment/refund/cancellation was initiated during this resume. No webhook reconfiguration is required.

[Full acknowledgment response matrix and operator runbook](ai-billing-webhook-acknowledgment-contract-2026-11.md). Summary: invalid HMAC401; malformed/unsupported400; identity/hash conflicts409 or conservatively non200; durable safe quarantine200/unprocessed; committed duplicate200; unconfirmed storage/provider/RPC failure503. A processed invoice is not proof of paid access.

Current Paystack documentation also describes a timestamped Paystack-Signature/whsec_ scheme and retains x-paystack-signature while the integration still has a secret key. This handler verifies the legacy signature actually observed for this integration. Do not delete/rotate signing credentials or activate the new scheme without a separately reviewed compatibility test. No signing setting was changed here. [Provider signature documentation](https://paystack.com/docs/payments/webhooks/).

## Isolated credit replay security remediation

The intervening branch edits fixed draft migration source, but the deployed reserve_ai_credits function still lacked exact execution/request binding. Fixture provenance was checked read-only: this task's tagged pending nonpayment subscription has no provider customer/subscription, receipt, credit ledger or billing operation. All test changes remain inside rollback transactions; no real account/payment is used.

A database test running under the actual authenticated SQL role reproduced the bug: a different owned execution could reuse the first reservation. We completed the existing CLI-generated scaffold `20261104122023_bind_ai_credit_replay_to_execution.sql` from the authoritative deployed function, adding only null-safe execution_id, request_id and agent_key replay checks. It preserves signature/defaults, return contract, ownership, active paid-term and refund-policy checks, per-user advisory lock, SECURITY DEFINER search_path and existing ACL. A source-hash precondition rejects unexpected function drift rather than overwriting it.

The candidate and fixture passed seven checks inside a transaction, then rolled back. The additive migration was applied **only to yyevuwvtrktrzwuzeddo**, recorded as history version **20261104123708**. Post-apply source hash is **b9c0ffb6432e9f9da7d8010845df0e77**, matching the reviewed definition. Seven post-apply checks pass: initial authenticated reserve; same execution/request idempotency; different owned execution denied; different owned request denied; original ledger unchanged; runtime claim once; duplicate settlement consumes once. All fixture state rolled back to pending. The broader17-assertion lifecycle/credit suite passes against the updated RPC too.

Existing ACL is unchanged. Reservation is a customer-facing RPC that requires auth.uid and owned execution; reconciliation/claim/settlement permissions remain separately protected. These are database-role tests, not new browser-session or AI-provider calls. See [credit remediation report](ai-credit-idempotency-binding-remediation-2026-11-04.md).

## Validation and source parity

- **102 local billing tests pass** after integrating upstream changes and adding two quarantine race/readback tests plus additive migration guards. Twelve original acknowledgment assertions failed before the webhook fix. The actual deployed credit replay test failed before its additive fix and passes after it.
- Fresh local TypeScript, source-secret audit, packaged build inputs, authorization manifest, Phase2 boundaries, Edge security, Phase3 preview controls and Phase4 concurrency model checks are executed before publication. Phase4 is a deterministic local model, not a live concurrency acceptance test.
- **11 deployed synthetic HTTP assertions passed on3November**, covering invalid HMAC/malformed input, concurrent unmatched acknowledgments/one row, conflicting content/original hash, review events, matched nonpayment AI invoice and matched marketplace failure. They are synthetic signed tests, not real provider activation. Their deployed source is unchanged and freshly matched.
- Six historical-payment/refund provider GET assertions passed on3November: original successful payment, reversed replacement, both renewal stops and both already-processed refunds. This resume freshly reads the original genuine webhook delivery only; historical provider checks are not relabelled as new executions.
- Seven endpoint boundaries passed on3November. On4November local transport rechecks reached checkout401; six others were unverified because local requests timed out/failed to connect. These are transport limitations, not observed application failures or new passes. The webhook's provider-origin200 and fresh Edge log are independently confirmed. Server source parity remains verified.
- SQL: fresh seven replay checks and17 lifecycle assertions pass on4November. Earlier rollback marketplace4, replacement4, profile2, operator/disabled-policy2 and authenticated cross-owner RLS2 checks remain3November evidence. Refund-policy-enabled SQL and actual concurrent refund/consumption are not rerun because activation is expressly prohibited.
- All **nine fetched TEST bundles /20 files match** reviewed source after CRLF/trailing-newline normalization. The additive SQL definition hash matches separately. [Hashes and versions](ai-billing-sandbox-source-parity-2026-11.json), [fresh redacted evidence](ai-billing-webhook-reliability-evidence-2026-11-04.json).

| Function | TEST version | JWT |
|---|---:|---|
| careerdev-paystack-webhook |10|false; raw-body HMAC required|
| careerdev-ai-subscription-verify |5|true|
| careerdev-ai-billing-reconcile |4|true|
| careerdev-ai-subscription-checkout |5|true|
| careerdev-ai-subscription-manage |4|true|
| careerdev-ai-payment-adjustment |1|true|
| careerdev-ai-agent-runtime |2|true|
| billing-sandbox-acknowledgment |3|true; fixed TEST-only bounded actions|
| billing-sandbox-provider-delivery |4|true; fixed one-shot probe|

Both self_service_enabled and refund-policy enabled remain **false**. No Edge Function deployment was needed during the resume; v10 and helperv3 were already serving the reviewed source. The only new persistent database change is the isolated additive reserve RPC migration.

## W01–W16 evidence by layer

PASS is restricted to the indicated invariant/layer. BLOCKED means the full acceptance requirement remains open. Historical evidence is explicitly identified; synthetic events are not provider success.

| Scenario | Status | Local / automated | Database | Deployed endpoints | Genuine provider | Browser / remaining requirement |
|---|---|---|---|---|---|---|
| W01 initial matched charge | BLOCKED | identity/plan/date guards pass | fresh rollback activation/one receipt | historical synthetic matched invoice stays pending/no receipt | historical paid references; current standalone acknowledgment only | new matched checkout/credits/client flow needs separate approval |
| W02 concurrent duplicates | PASS, bounded | concurrent unmatched/no downgrade tests | atomic/idempotent receipts |3Nov simultaneous synthetic requests/one event | original attempts1–7 retain one event | paid concurrent grant not newly generated |
| W03 interruption before RPC | PASS, bounded | storage/readback/provider failure guards | fresh seeded retry/receipt deduplication | historical seeded replay | no artificial real-provider crash | — |
| W04 commit before response | PASS, bounded | duplicate guards | fresh committed retry | historical matched synthetic duplicates | repeated unmatched delivery/one record | — |
| W05 customer mismatch | PASS, bounded | exact customer/reference/plan guards | mismatch and3Nov cross-owner RLS | prior owner/anonymous denials; fresh checkout401 | historical exact customer GET |3Nov no-session origin redirects |
| W06 ambiguous code | PASS, bounded | exact identifier conflicts | fresh uniqueness rejection | historical conflict rejection | — | no shared customer/plan fallback |
| W07 wrong HMAC | PASS | no insert | no financial delta |3Nov invalid HMAC401 | real HMAC accepted on v10 | — |
| W08 late charge after cancel | BLOCKED | lifecycle safety passes | fresh synthetic late-payment rule | historical synthetic handling | no actual late provider subscription event | provider-supported scenario required |
| W09 old paid-through date | PASS, bounded | date validation | fresh no-shortening/historical receipt check | historical verified replay, not repeated | historical transaction GET | — |
| W10 failed then paid renewal | BLOCKED | state model passes | fresh synthetic sequence | no new real renewal | deterministic supported TEST sequence not established | provider outcome/control required |
| W11 cancel during paid term | BLOCKED, partial | access/terminal rules | fresh cancellation/deferred upgrade rules | historical actual cancellation/current matching management source |3Nov retained renewals stopped | coach nonrenewing UI/history; fresh client confirmation open |
| W12 expiry | BLOCKED | exact date boundary | fresh expired access denied | no new natural-term session transition | prior time simulation is not natural expiry | true expired-session and natural term required |
| W13 marketplace isolation | PASS, bounded | wrong-ledger collision guards |3Nov rollback success/refund/duplicate | synthetic failed transaction processed once | original real charge stays unassigned | pre-existing marketplace hashes unchanged |
| W14 unmatched event | PASS, bounded | no provider/settlement call; race safety | unmatched durable state |3Nov synthetic200/unprocessed | **real Delivered200,attempt7,unassigned** | not a real recurring invoice |
| W15 malformed dates | PASS, bounded | normalization guards | fresh fail-closed date check | historical signed coverage | no fabricated malformed real invoice | — |
| W16 replacement | BLOCKED | selection/overlap guards |3Nov replacement4; fresh lifecycle upgrade rule | earlier matched replacement evidence retained | no new replacement payment | client replacement UI/natural eligibility still open |

## Browser evidence and availability

3November read-only coach desktop/mobile acceptance remains valid for that snapshot: Fresher NGN7,500,25 remaining/0 used/0 reserved, paid through1December, renewal stopped, history visible, upgrades disabled. Mobile390x844/document375 screenshots pass visual review; viewport reset and temporary tabs closed. A separate origin without a session redirected billing to the account chooser. The existing coach is Applicant, so approved-coach onboarding cannot be claimed; its isolated dashboard also showed a Calendly request error, recorded without unrelated changes.

Browser automation is not available in this resumed session. Client desktop/mobile, approved-coach onboarding, cancellation confirmation, replacement selection after payment and true expired-session behavior remain open. No user session was revoked or manipulated. Screenshots and the earlier execution report preserve the exact tested scope.

## Financial integrity

Fresh database state: **9 receipts,11 subscriptions,3 credit rows**, both gates false; the additional subscription is the tagged pending nonpayment fixture created3November. Existing real-reference/synthetic receipts and credits are preserved. A synthetic marketplace failure transaction remains failed/blocked with one sync audit, never funded. No new Paystack transaction, charge, refund, cancellation, paid entitlement or credit row was created in this resume.

The same five baseline hashes match after excluding only the two specifically tagged fixtures created3November (pending subscription fd310d20-d1b7-48e2-99b9-37219571407a and failed marketplace transaction39d3ff3c-437b-4428-a999-044cc051cda8 with its sync row): subscriptions91ee8ed0c482cbef5aa4a19be19b67cc; receiptsda62aa3bf8accbda638668a42c4a0312; credits16fbf98e30c0fb52c6237502205a35a2; marketplace2824df9de021b20a5f9b159117b03a2c; marketplace syncf3a3347f358cf291012ef7d861286097. Credit fixture updates fully rolled back; its status is pending again.

Earlier five database-only receipt fixtures remain distinct from four historical provider-reference receipts. The tagged containment fixtures and prepared synthetic operation5dbf47a5-c13a-4d7e-afb1-033579664e6f remain untouched. No attribution is guessed; historical usage/lots/adjustments/audits are retained. With the refund policy disabled, do not claim its reversal enforcement is activated merely because prior TEST refunds processed.

## Schema provenance, rehearsal and security findings

The3November selected production/test catalog comparison remains a partial inventory, not a full authoritative production export. It identified differing receipt/runtime/lot columns, indexes, triggers and RPCs despite matching selected policies. There is no separate disposable production-shaped target among the two available projects. No production query or write was necessary during this resume.

The isolated history now has23 entries. The new additive source timestamp20261104122023 is recorded by the tool as20261104123708; its reviewed function hash is recorded explicitly. Earlier policy/replacement history timestamps and missing separate lifecycle/marketplace history entries remain documented; no guessed history repair occurred. The new migration is source-hash guarded and must be rehearsed against the authoritative production-shaped baseline before release. The existing [rehearsal plan and selected inventory](ai-billing-migration-rehearsal-inventory-2026-11.json) are preserved.

Required rehearsal: obtain an owner-provided schema-only Supabase export/history with extensions, auth references, policies/grants/triggers/functions/indexes; provision a separate approved disposable database; verify baseline hashes; apply the ordered reviewed lifecycle, marketplace, disabled policy, replacement and additive replay migrations; run fixture/authorization/failure/rollback/recovery checks; preserve old receipts/credits and unresolved attribution. Do not reconstruct missing production DDL. Policy-enabled testing requires separate scoped authorization under the current explicit gate prohibition.

Fresh advisor counts remain6 security rules (1INFO/5WARN) and5 performance rules (2INFO/3WARN). They are project findings, not new claims that the security audit is complete. [Search-path remediation](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [anonymous definer exposure review](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [authenticated definer exposure review](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [RLS/index performance review](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan). All current rule/remediation URLs are included in the evidence JSON. No unrelated grants, policies or integration settings were altered.

## Remaining blockers and owner actions

| Missing | Why required | Who / exact action | New TEST payment? |
|---|---|---|---|
| W01 matched activation/client UI | standalone receipt does not prove subscription allocation | Owner reviews [one NGN7,500 Fresher/25-credit plan](ai-billing-next-test-checkout-plan-2026-11.md); separately approve payment and renewal stop. Engineer establishes a reviewed gate-controlled path before initializing once | Yes; not initialized |
| W08/W10 late/recurring lifecycle | synthetic states are insufficient | Paystack/support provides documented TEST controls/outcomes or approved scheduled observation | Possibly; separately approved |
| W11/W12/W16 and client/approved-coach sessions | final browser/expiry/replacement acceptance is incomplete | Owner/tester supplies suitable isolated sessions/approved fixture; engineer resumes UI when available; never fake expiry or coach approval | Replacement yes; other UI/expiry no |
| Policy-enabled refunds/chargebacks, concurrent consumption and bank decisions | disabled policy/local normalization do not prove live reversal safety | Owner separately authorizes bounded gate-enabled testing; Paystack supplies supported adjudication evidence. Do not repeat existing refunds | No new refund/payment inherently required |
| Full schema provenance and disposable rehearsal | current TEST baseline is partial | Maintainer supplies authoritative schema-only export/history and separate disposable target; run ordered rehearsal and recovery | No |
| Historical attribution / synthetic prepared operation | existing payment ownership cannot be guessed | Owner/operator reviews authoritative attribution and separately resolves tagged operation with audit | No |
| Unmatched marketplace recovery operations |200 stops transport retries, so review queue must be owned | Maintainer assigns monitoring/operator and reviews audited exact-match recovery tooling. The original standalone payment stays unassigned | No |
| New local endpoint transport timeouts | six current HTTP status checks could not complete | Restore a reliable test connection and rerun read-only boundary checks; preserve earlier passes and current failures separately | No |

The genuine post-fix provider200 blocker is **closed**. The earlier resend uncertainty is historical, not a reason to issue another resend. Current documentation research did not establish a deterministic Paystack TEST recurring-failure/success clock or a bank-won simulator; do not invent either or change approved plan pricing.

**Production safety:** no production database write, production Edge Function deployment, Paystack LIVE setting/credential change, Vercel production deployment or GitHub merge was performed. Both billing gates remain disabled. PR42 remains draft. The new additive database change is isolated TEST only; explicit owner production approval remains mandatory after all acceptance gates pass.
