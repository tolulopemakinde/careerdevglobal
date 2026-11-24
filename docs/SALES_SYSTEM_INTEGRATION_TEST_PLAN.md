# Sales System Integration Test Plan

## Safety
Run these checks in preview with synthetic test accounts. Do not send real marketing messages, charge real payment methods, modify production data, or weaken Row Level Security.

## Access control
- Verify signed-out users are redirected to admin login.
- Verify active Staff and Admin access only when allowed by database policies.
- Verify Client, Coach, inactive and suspended accounts are denied.
- Verify Supabase Row Level Security independently of UI checks.

## Dashboard
- Test 7-, 30-, and 90-day windows against known synthetic records.
- Verify empty states and safe error states.
- Keep totals separated by currency.
- Reconcile payment timestamps with canonical transaction state before describing amounts as collected cash.
- Keep lead-to-paid conversion labelled as a directional proxy until attribution is implemented.
- Test 320px, 375px, 768px and desktop layouts, keyboard navigation and horizontal overflow.

## Attribution
- Test source, landing page, campaign parameters and consent evidence.
- Preserve existing source conventions and document repeat-visit rules.
- Test malformed fields, duplicate submissions and spam protection.

## Payments
- Test sandbox success, pending, failure, cancellation, refund and chargeback.
- Reject invalid webhook signatures.
- Replay events and confirm idempotency.
- Never let a browser return URL alone mark an order paid.
- Reconcile orders to canonical payment-provider transactions.

## Brevo and communications
- Use test contacts only.
- Separate transactional messages from marketing.
- Verify consent evidence, unsubscribe, suppression, bounce handling and idempotent retries.
- Do not enable WhatsApp automation until consent, approved templates, provider configuration and opt-out are tested.

## Calendly and fulfilment
- Test correct coach/service and timezone, OAuth reconnect, booking create/reschedule/cancel and duplicate events.
- Ensure booking status does not automatically imply revenue.
- Confirm orders have an owner, next step, delivery status and quality review.

## Release gates
1. Staff/Admin authorization and RLS pass.
2. Revenue reconciles against test transactions and refunds.
3. Payment signature, idempotency and refund tests pass.
4. Consent, unsubscribe and suppression tests pass.
5. Booking and delivery tests pass end to end.
6. Mobile, accessibility and error states pass.
7. Owners approve rollback and launch checklist.

Current scope: the dashboard is read-only reporting, not a verified end-to-end sales automation system or profit ledger. Keep campaigns and production integrations inactive until their gates pass.
