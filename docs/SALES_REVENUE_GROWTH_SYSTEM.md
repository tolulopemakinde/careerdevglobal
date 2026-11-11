# CareerDev Global Sales & Revenue Growth System

**Status:** Prepared for review; launch-disabled by default  
**Owner:** CareerDev Global leadership  
**Purpose:** Establish one measurable, ethical sales operating system across individual services, coaching, and institutional partnerships.

## 1. Operating principles

1. Authority before volume: publish evidence-led, useful career and workforce guidance.
2. Buyers over spectators: optimize for qualified leads, completed purchases, collected revenue, contribution margin, and customer outcomes—not likes alone.
3. Clear offers: define target buyer, deliverables, turnaround, price, limitations, and next step.
4. No false promises: never invent testimonials, results, credentials, scarcity, or employment guarantees.
5. Consent and privacy: use contact data only for disclosed purposes; respect opt-outs and applicable privacy requirements.
6. No automatic launch: marketing campaigns, bulk sends, paid advertising, and production integrations remain disabled until an authorized launch decision.

## 2. Revenue engines

### A. Individual career services
Target job seekers, graduates, professionals, and career changers. Candidate offers include CV revamp, cover letters, LinkedIn optimization, career assessment, and career strategy. Use a self-service purchase path for clearly scoped services.

### B. Premium coaching
Target experienced professionals, managers, executives, and leaders. Use qualification, coach matching, a discovery call where appropriate, transparent scope, and a written proposal.

### C. Institutional and corporate programmes
Target universities, NGOs, employers, training providers, and development organizations. Sell employability workshops, career-readiness programmes, leadership development, and talent-development support through account-based outreach and tailored proposals.

These are operating categories; confirm current service availability, delivery capacity, prices, and margin before publishing offers.

## 3. Funnel and lifecycle

1. **Discovered:** visitor arrives from blog, social, search, referral, partner, or campaign.
2. **Engaged:** visitor consumes useful content or visits a service page.
3. **Lead:** visitor explicitly submits an enquiry, assessment request, or consultation request.
4. **Qualified:** need, service fit, timing, and budget/authority are sufficiently understood for the offer.
5. **Offer presented:** relevant service, deliverables, price, limitations, and next step are shared.
6. **Checkout/proposal:** individual checkout or institutional proposal is initiated.
7. **Paid/won:** payment is confirmed by a trusted payment event, or a contract milestone is verified.
8. **Delivery:** onboarding, work allocation, service status, and completion are tracked.
9. **Retention/referral:** satisfaction is requested; relevant next service or voluntary referral is offered without pressure.

A lead is not a customer until a successful payment or verified contract milestone is recorded. A checkout start is not revenue.

## 4. Recommended system ownership

- **Website / Vercel:** service pages, content, landing pages, forms, checkout UX, and responsive experience.
- **Supabase:** source of truth for leads, attribution, offers, orders, payment status, proposals, delivery, and consent/audit records.
- **Brevo:** approved contact lists, consent-based nurture and transactional communications. Keep client and coach audiences appropriately segmented.
- **Calendly:** consultations and coaching calls where needed; verify OAuth and booking flows before activation.
- **Payment provider:** authoritative payment status. Never trust a browser redirect alone as proof of payment.
- **Analytics/reporting:** weekly funnel and unit-economics report using verified records.
- **GitHub/Vercel Preview:** changes reviewed and tested before any production deployment.

Reuse existing platform components where appropriate. Do not create duplicate CRM records or parallel signup pages when an existing supported flow can be extended.

## 5. Data model requirements

Map to existing schema before creating tables. Avoid duplicate or conflicting sources of truth.

### Lead record
- lead_id
- created_at / updated_at
- name and contact channels (only fields necessary for the stated purpose)
- consent state, consent timestamp, source, and privacy notice version where relevant
- lifecycle stage and stage timestamp
- interested service / segment (individual, coaching, institution)
- acquisition source, campaign, content/landing page, UTM fields
- assigned owner, next action, next-action date
- qualification notes limited to relevant business information
- opt-out / suppression status

### Offer and order
- offer_id, public name, segment, published status, price/currency, deliverables, delivery SLA, direct delivery cost estimate, capacity
- order_id, lead/customer reference, offer reference, currency, subtotal, discounts, taxes where applicable, payment status, payment-provider reference, timestamps, refund status
- do not store raw card details or secrets
- revenue reporting must use confirmed paid transactions and account for refunds/chargebacks

### Institutional opportunity
- organization, contact and permission basis, problem/opportunity, estimated value and currency, stage, decision timeline, owner, next action, proposal link/version, outcome/loss reason
- restrict access to relevant staff; avoid collecting unnecessary personal or sensitive data

### Delivery and customer outcomes
- order reference, assigned coach/team, delivery status, due date, completion date, feedback request status, complaint/refund state, review permission
- store testimonial permission separately; no public use without explicit permission

## 6. Automation requirements

1. **Lead intake:** validate fields, record source and consent, prevent duplicate submissions, and show clear success/error feedback.
2. **Acknowledgement:** send a useful transactional confirmation; do not subscribe someone to marketing merely because they submitted an enquiry.
3. **Qualification and routing:** assign the appropriate individual-service, coaching, or institutional workflow.
4. **Payment confirmation:** idempotently process verified payment webhooks; record event IDs; handle duplicates, delayed events, failures, refunds, and mismatches.
5. **Order onboarding:** only confirmed orders trigger paid-order onboarding. Failed/pending payment must never be marked paid.
6. **Consultation:** verify Calendly OAuth, booking ownership, cancellations, time zones, and notification behavior.
7. **Nurture:** use consented audience segments, relevant content, frequency limits, and functional unsubscribe/suppression.
8. **Delivery:** track assignment, due date, completion, exceptions, and customer notification.
9. **Feedback/referral:** request honest feedback after completion; no incentive or language that requires a positive review.
10. **Monitoring:** log failures without leaking personal data; alert the responsible operator; retry safely; provide a manual recovery path.

Every automation needs an owner, trigger, preconditions, idempotency behavior, failure handling, audit trail, and test case.

## 7. Authority content operating system

Create one evidence-backed cornerstone article or research note weekly, then repurpose it into channel-specific posts.

Content pillars:
- Career problem diagnosis
- Evidence-led labour-market, employability, skills, and leadership insights
- Demonstrations of CareerDev Global methods
- Verified testimonials/case studies with permission
- Specific service explanations and buyer FAQs

Recommended weekly cadence:
- Monday: cornerstone article / expert analysis
- Tuesday: short problem-focused post or video
- Wednesday: checklist or practical guide
- Thursday: method demonstration or permissioned case study
- Friday: clear service offer
- Saturday: buyer objection FAQ
- Sunday: review performance and plan

Quality gate: verify sources and statistics; distinguish evidence from opinion; remove unsupported claims; confirm links, accessibility, mobile layout, and offer details. AI-assisted content must be reviewed by a human before publishing.

Every content item should record its intended buyer, problem, evidence/source, CTA, destination URL, owner, publication status, campaign/source tags, and performance. Do not use engagement bait or pressure-based selling.

## 8. Offer design checklist

Before publishing an offer, confirm:
- Defined target buyer and qualifying need
- Specific deliverables and exclusions
- Price, currency, payment terms, and refund/cancellation terms
- Realistic turnaround and delivery capacity
- Coach/consultant credentials where relevant
- Privacy and document-handling expectations
- Honest outcome claims (no guaranteed job/interview)
- Working mobile page, checkout, receipt, and support contact
- Contribution-margin review and approval by business owner

Suggested offer ladder:
- Entry: one focused service
- Bundle: complementary services with clear scope
- Premium: structured coaching / career strategy
- Institutional: scoped workshops/programmes and contracts

Only publish offers actually ready to deliver.

## 9. Weekly dashboard definitions

- **Qualified leads:** distinct leads meeting the defined qualification criteria during the period.
- **Lead-to-paid conversion:** distinct leads with a confirmed first paid order divided by eligible qualified leads in the same cohort; define cohort and window consistently.
- **Average order value:** net sales value of confirmed orders divided by confirmed orders; state whether refunds/tax are excluded.
- **Collected revenue:** settled customer receipts less refunds/chargebacks according to accounting policy; report currency and period.
- **Direct delivery cost:** attributable coach/vendor/time costs for delivered orders.
- **Contribution after marketing:** collected/net sales basis less direct delivery costs and attributable marketing spend. It is not net profit.
- **Customer acquisition cost:** attributable acquisition spend divided by new paying customers for the same cohort/window.
- **Repeat purchase rate:** customers with more than one qualifying paid order divided by eligible customers.
- **Institutional pipeline:** value-weighted or unweighted opportunity value, clearly labelled; never report pipeline as collected revenue.
- **Service quality:** on-time completion, complaints, refunds, and feedback response.

Segment by offer, buyer segment, channel/campaign, currency, and time period. Do not combine unlike currencies without a documented exchange-rate method. Establish the baseline before setting growth claims.

## 10. Launch gates

Keep launch disabled until the owner approves:
- [ ] Current production and repository state reviewed; no conflicting CRM/order implementation
- [ ] Schema mapping and access policies reviewed; least privilege and RLS verified
- [ ] Privacy notice, consent, retention, suppression and unsubscribe flows checked
- [ ] Service availability, price, scope, delivery capacity, and refund terms approved
- [ ] Payment webhook signature, idempotency, duplicate event and refund tests passed
- [ ] Brevo lists, transactional templates, sender identity, suppression and opt-out verified
- [ ] Calendly OAuth/booking/cancellation tested if used
- [ ] Attribution and dashboard definitions validated against known test transactions
- [ ] Mobile, accessibility, broken-link, error and checkout tests passed
- [ ] Test-data end-to-end run completed without touching live customer records
- [ ] Monitoring, incident owner, rollback plan and manual recovery documented
- [ ] Leadership explicitly approves production deployment and campaign activation

## 11. 30-day rollout

**Days 1–7:** audit existing pages, schema, payments, Brevo, Calendly, current offers and baseline metrics; choose one individual offer, one coaching offer, and one institutional campaign.

**Days 8–14:** prepare and review authority content; improve the selected service page; test lead capture and attribution with test data; begin approved one-to-one outreach.

**Days 15–21:** test the full lead-to-payment-to-onboarding path; review objections and drop-offs; prepare tailored institutional proposals; verify all email consent rules.

**Days 22–30:** analyze actual paid conversions, contribution margin, delivery capacity, customer feedback, and channel quality; scale only what shows sound economics.

## 12. Activation policy

This document defines the target operating system. It does not itself prove that each integration exists or works, and it does not authorize a live launch. Production changes, database migrations, bulk messages, advertising spend, or customer-data modifications require separate testing and explicit approval.
