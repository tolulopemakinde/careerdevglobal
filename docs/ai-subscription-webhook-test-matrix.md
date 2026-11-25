# AI subscription webhook regression test matrix

These are **required test cases**, not evidence that tests passed. Use Paystack sandbox fixtures and isolated Supabase data before enabling billing controls.

| Case | Expected result |
|---|---|
| Valid signed subscription.disable with exact subscription code and unexpired paid period | Non-renewing; paid entitlements retained until period end |
| Valid signed subscription.disable after period end | Canceled; no paid entitlements |
| Event with only a shared Paystack plan code | Unmatched; no subscription mutation |
| Event with only a customer code | Unmatched; no subscription mutation |
| Event with valid reference to subscription A | Only subscription A changes |
| Invalid signature | HTTP 401; no mutation |
| Replayed identical event | Idempotent; no second mutation |
| Different events for the same subscription | Both retained; event deduplication does not collide |
| Delayed invoice.update paid after non-renewing | Does not re-enable renewal |
| Duplicate cancellation request | No duplicate billing side effect |
| Paystack API timeout | No locally asserted successful cancellation |
| Missing provider subscription code | Reject and escalate |
| Client A calls management endpoint for Client B | No cross-user operation |
| Active subscription upgrade | No second active subscription or shared plan mutation |

## Further blockers

- The draft webhook uses event type plus raw payload hash as an event reference; verify event identity and database column limits before release.
- The marketplace webhook branch handles charge.success separately; verify the AI subscription activation and renewal path is complete, including payment verification and webhook order.
- Confirm Paystack's subscription.disable behavior and current-period semantics using real sandbox provider responses.
- Ensure cancellation endpoint and webhook converge even when events arrive before the endpoint's database update.
- Run Deno/TypeScript validation, integration tests, authenticated browser tests, and an actual preview deployment.
- The management page cancellation control must remain disabled until all gates pass.
- Individual subscription upgrades are not implemented. Do not merge this PR as a completed self-service feature.
