# CareerDev Global Sales System — Launch Checklist

**Default state: NOT ACTIVATED**

Use this checklist before launching sales campaigns or enabling new automations. Tick items only when evidence is available.

## Business readiness
- [ ] Leadership selects priority individual service, coaching offer, and institutional programme.
- [ ] Prices, currency, scope, turnaround, refund terms, capacity, and direct delivery costs are approved.
- [ ] Sales owner, delivery owner, escalation owner, and customer-support contact are assigned.
- [ ] Public service claims and all testimonials are substantiated and permissioned.

## Website and checkout
- [ ] Existing pages are reused where practical; no duplicate signup or checkout flow is introduced.
- [ ] Mobile/tablet/desktop service pages and forms are usable.
- [ ] Forms validate input and provide accessible success/error messages.
- [ ] Source/campaign attribution survives the lead-to-order journey.
- [ ] Payment provider confirms payment server-side; browser redirects are not treated as proof.
- [ ] Checkout, failed payment, pending payment, duplicate webhook, refund, and cancellation paths pass test cases.

## Data and security
- [ ] Existing Supabase schema reviewed before any migration.
- [ ] RLS and authorization tests cover anonymous, customer, coach, and staff roles.
- [ ] No secrets or payment card data are exposed in browser code or logs.
- [ ] Consent, privacy notice version, opt-out and suppression status are recorded appropriately.
- [ ] Test records are clearly identifiable and removable without touching real customer records.
- [ ] Retention, deletion, and incident response processes are documented.

## Brevo and Calendly
- [ ] Brevo sender identity and templates are verified.
- [ ] Client and coach lists are correctly segmented.
- [ ] Transactional messages are distinct from marketing consent.
- [ ] Unsubscribe/suppression works and is honored by every campaign.
- [ ] No campaign is scheduled or sent until expressly approved.
- [ ] Calendly OAuth, time zone, booking, cancellation, coach assignment and notifications pass tests.

## Reporting
- [ ] Definitions for lead, qualified lead, paid customer, revenue, refund, contribution and CAC are documented.
- [ ] Dashboard totals reconcile to known test orders and payment records.
- [ ] Currency is shown per record or converted with a documented rate and date.
- [ ] Institutional pipeline is clearly distinguished from booked/collected revenue.
- [ ] Access to revenue and customer data is role-restricted.

## Release approval
- [ ] Automated checks and preview build pass.
- [ ] End-to-end test is completed with test data.
- [ ] Monitoring, alert ownership, rollback, and manual recovery are ready.
- [ ] Leadership reviews the evidence and approves the release.
- [ ] Separate approval is recorded for campaign sending, advertising spend, or bulk outreach.

**Activation record**
- Approved by:
- Date/time:
- Release / commit:
- Test evidence:
- Rollback owner:
- Campaigns approved:
- Limits / exclusions:
