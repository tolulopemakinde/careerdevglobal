# Paystack webhook acknowledgment contract — 3 November 2026

Status: implemented in the development branch and isolated TEST webhook v10. Production is unchanged. `received` acknowledges transport; `processed` records an applied business event. Neither flag alone proves a paid entitlement: invoice creation can be processed while the subscription remains pending and has no receipt.

## Provider contract and root cause

[Paystack webhooks](https://paystack.com/docs/payments/webhooks/) defines HTTP200 as acknowledgment and retries other responses; it documents TEST retries hourly for ten hours and a 30-second timeout. Our actual initial six attempts occurred within twenty minutes, so the documented cadence is not a delivery guarantee. HMAC-SHA512 is validated over the raw body before parsing or persistence.

The real standalone TEST charge had a valid HMAC and one durable marketplace event, but no order. v9 called `apply_paystack_webhook_state` with a null transaction_id. That RPC correctly raised `transaction_reference_required`; the handler conflated the business quarantine with infrastructure failure and returned503. No funds or credits were allocated.

## Response matrix

| State | HTTP | Durable state / business meaning | Recovery |
|---|---:|---|---|
| Non-POST | 405 | No event | Correct method |
| Missing/invalid HMAC | 401 | No event or financial write | Correct authenticated request |
| Signed malformed JSON, non-object data, unsupported event | 400 | No accepted event | Inspect sender contract; no automatic business application |
| Missing server configuration | 503 | Not safely accepted | Repair configuration and retry |
| Correlation database failure | 503 | Attribution not safely established | Restore database; retry |
| Conflicting reference fields / subscription identifiers | 503 | No event inserted; fail closed | Operator investigation; conservatively retained non200, not silently classified as transient |
| AI + marketplace identity collision | 409 | No wrong-ledger write | Investigate ownership conflict |
| Same marketplace provider identity with different raw hash | 409 | Original hash/payload preserved | Review conflicting delivery; do not overwrite original |
| Insert failed and exact existing event cannot be read | 503 | Durability unconfirmed | Retry after storage recovery |
| Valid unmatched AI event | 200 | `unmatched`, review reason, processed_at stays null; processed:false | Exact identity/operator replay |
| Valid unmatched marketplace event | 200 | Existing `verified` state plus `No exact marketplace match; operator reconciliation required`; null transaction_id/processed_at; processed:false | Operator review; do not attach standalone probe to an order |
| AI refund/dispute | 200 | `failed` plus explicit verified-operator-review reason; processed:false | Separate provider verification and approved reversal policy; gate stays false |
| Marketplace dispute | 200 | `verified` plus explicit review reason; processed:false | Existing marketplace dispute workflow; no AI mutation |
| Quarantine update/readback fails or row disappears | 503 | Review persistence not confirmed | Restore storage; retry |
| Exact already-processed duplicate | 200 | Existing event; processed:true, duplicate:true | No additional financial application |
| Matched AI/marketplace event applied successfully | 200 | Transactional RPC result, processed:true | Check receipts/entitlements separately for paid charges |
| Newly found marketplace match disagrees with stored attribution, including null | 409 | No automatic rebinding | Audited operator attribution required |
| Provider verification / transactional RPC error | 503 | `failed` where persistence succeeds; processed:false | Investigate provider/DB/business invariant; no false acknowledgment |
| Other explicit unapplied RPC result | 409 | No claim of settlement | Operator reconciliation |

The fix does not blanket-convert409/503. Invariant/identity failures and unclassified reconciliation errors remain non200. Known safe unmatched/manual-review cases avoid unnecessary retries once their review state is durably confirmed. Legacy processed marketplace event recognition, AI hash identity, marketplace type+provider-ID identity, strict receipt identity, and HMAC provenance are preserved.

## Persistence, concurrency and compatibility

No schema change is needed. AI supports unmatched; marketplace's CHECK allows received/verified/processed/ignored/failed. Marketplace quarantine uses verified plus a durable review reason rather than inventing an enum or setting processed. `verification_source` remains exclusive to AI events. Updates exclude processed rows. If another worker finishes first, the handler reads the current row and reports the committed duplicate; it never downgrades a processed event.

Duplicates read the exact existing identity and raw hash after insert contention. A duplicate quarantined event stays unreconciled and can be acknowledged again without creating a second row. The successful acknowledgment is contingent on an UPDATE returning the retained row or a successful concurrent-processed readback.

## Operator recovery and monitoring

1. Review nonprocessed AI rows and marketplace verified/failed rows with review reasons. Keep ID, raw payload hash, signature provenance, received_at, nullable business identity and error_message. A 200 delivery does not remove an item from this queue. Assign an operator and queue monitoring before production activation; no background reconciliation job was introduced.
2. AI: use `careerdev-ai-billing-reconcile` with an active staff/admin session, exact event_id and a specific reason. It rechecks provider payment identity and invokes service-only `reconcile_ai_subscription_event`, which records `ai_billing_reconciliation_audit`. Acknowledged unmatched events remain replayable. Suspended actors and direct untrusted RPC calls are denied.
3. Marketplace: existing service-only `apply_paystack_webhook_state` remains available for correctly attributed events and records payment state-sync and transaction events atomically. There is no new public API that binds an unmatched event. A null/contradictory association requires a separately reviewed, audited operator resolution against exact reference/order/amount/currency evidence before using that RPC. Do not guess attribution or edit existing real payment attribution. The standalone charge must remain unassigned. End-to-end audited marketplace attribution tooling remains an operational release requirement where such recovery is needed.
4. Refund/dispute: a received webhook is notification evidence, not authority to reverse credits or declare a bank outcome. Verify the provider object through the adjustment workflow only after policy activation is separately authorized. Do not enable that gate for a test replay. Preserve historical lots/usage and all prior failed runs.
5. Retry503 after fixing configuration/storage/provider issues. Inspect409 conflicts rather than repeatedly forcing delivery. Never rewrite the event hash or mark processed to suppress retries.

## Genuine provider validation — confirmed 4 November

Paystack event6aea261cc2ff06530f130f88 for standalone TEST transaction6726807449 now reports Delivered/HTTP200/trial_count7, updated3November20:07:36UTC (21:07:36WAT). Supabase Edge logs independently show POST200 on webhookv10 at20:07:36.221UTC. The exact endpoint/payload matches; the same one signed row is verified/unassigned, processed_at null, original raw hash unchanged. This closes genuine post-fix acknowledgment while correctly retaining financial quarantine.

An earlier one-shot documented resend was attempted after TEST identity/destination/no-financial-link/hash/gates validation and did not confirm acceptance. Its claim/failure remain preserved. The delivery record does not distinguish automatic retry from that earlier uncertain request, so do not assert a mechanism or issue another resend. No new charge/refund/cancellation was created.

The provider's current documentation also describes the newer timestamped Paystack-Signature/whsec_ scheme, while retaining x-paystack-signature when the integration still has its secret key. This implementation uses the legacy HMAC actually validated here. A signing-scheme/key migration requires separate reviewed compatibility testing; no signing setting changed in this task.
