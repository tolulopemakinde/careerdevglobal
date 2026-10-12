# CareerDev Global — Segmented Sales & Customer Lifecycle System

## Purpose
Prepare a measurable, respectful, category-specific sales and retention system before launch. Earn trust through useful expertise, clear service outcomes, relevant follow-up and excellent delivery—not pressure, inflated promises or engagement bait.

## Target segments and value propositions
1. **Students and recent graduates** — career direction, skills/gap assessment, learning plans, CV and interview readiness. Lead with clarity and practical next steps; do not promise employment.
2. **Job seekers and working professionals** — CV/resume revamp, cover letters, LinkedIn positioning, interview preparation and career transition support. Lead with clear positioning, evidence of impact and a tailored next step.
3. **Executives and people leaders** — leadership coaching, executive development and career transitions. Lead with confidential, goal-led development and agreed outcomes; avoid unsupported ROI claims.
4. **Career coaches and practitioners** — coach profile visibility, tools, professional insights, ethical AI-supported preparation and opportunities to serve clients. The coach retains professional judgment.
5. **Institutions and employers** — universities, NGOs, employers and workforce programmes seeking employability, youth livelihoods, talent mobility, staff development, coaching and programme partnerships. Lead with discovery and a scoped pilot.
6. **Internationally mobile professionals and migrants** — career translation across markets, transferable skills, professional positioning and job-search planning. Never promise visas, migration approval, employment or placement.

## Email sequence architecture
Create one consent-based marketing automation per segment, with separate message content and entry rules. Proposed cadence:
- Day 0: deliver the requested resource / welcome and set expectations.
- Day 2: teach one practical insight relevant to the segment.
- Day 5: explain a method or useful example.
- Day 8: offer the relevant service or discovery conversation.
- Day 13: answer a common concern and give a low-pressure next step.
- Day 21 onward: move non-converters to the segment's ongoing useful newsletter only if they remain subscribed.
Stop the acquisition sequence when a contact purchases, books a meeting, unsubscribes, or becomes ineligible.

Do not send these sequences to existing pilot tester lists by default. Keep pilot onboarding and transactional notices separate from marketing. Entry requires explicit, recorded marketing consent for the relevant topic and a clear source/timestamp. Never infer marketing consent from account creation, service purchase, or coach/client role.

## Sequence content plan

### Segment A — Students and recent graduates
1. **Day 0 — Welcome:** Your next career step starts with clarity. CTA: complete a short career-goals profile.
2. **Day 2 — Education-to-work:** Translate projects, volunteering and coursework into evidence of skills. CTA: use a skills inventory.
3. **Day 5 — Skill gaps:** Choose one role family and compare current skills with credible role requirements. CTA: explore a learning plan.
4. **Day 8 — Professional readiness:** Explain how a targeted CV and LinkedIn profile communicate relevant evidence. CTA: explore CV/profile support.
5. **Day 13 — Gentle invitation:** Book a career guidance conversation or explore the platform. No job guarantee.

### Segment B — Job seekers and working professionals
1. **Day 0 — Welcome:** Make the value of your experience easy to understand. CTA: identify a target role.
2. **Day 2 — CV insight:** Replace task lists with evidence, scope and outcomes where accurate. CTA: review CV positioning.
3. **Day 5 — LinkedIn insight:** Align headline, About section and experience to the same professional story. CTA: review profile support.
4. **Day 8 — Service invitation:** Choose CV, cover letter, LinkedIn or coaching support according to the current bottleneck. CTA: view relevant service.
5. **Day 13 — Objection handling:** Explain the process, client inputs, review steps and realistic limits. CTA: request a service consultation.

### Segment C — Executives and people leaders
1. **Day 0 — Welcome:** Leadership development begins with outcomes and context. CTA: identify one leadership priority.
2. **Day 2 — Reflection:** Align leadership behaviors, stakeholder expectations and strategic objectives. CTA: use a leadership reflection prompt.
3. **Day 5 — Method:** Explain goal-setting, coaching conversations and review milestones. CTA: explore leadership coaching.
4. **Day 8 — Invitation:** Offer a confidential discovery conversation to assess fit, scope and expectations. CTA: request a conversation.
5. **Day 13 — Fit and expectations:** Coaching is collaborative; outcomes are agreed rather than guaranteed. CTA: reply with a priority or pause follow-up.

### Segment D — Career coaches and practitioners
1. **Day 0 — Welcome:** A coach-centered professional community. CTA: complete or update the coach profile.
2. **Day 2 — Practice quality:** Share a practical note on evidence-led, ethical career guidance and client ownership. CTA: review practice profile.
3. **Day 5 — Visibility:** Explain how accurate specialisms, credentials, service descriptions and insights help clients assess fit. CTA: improve profile completeness.
4. **Day 8 — Platform invitation:** Show relevant coach workflows, service opportunities and AI support while retaining human professional judgment. CTA: request onboarding details.
5. **Day 13 — Partnership:** Ask which client needs, specialties and support would make participation valuable. CTA: reply with interests; no income guarantee.

### Segment E — Institutions and employers
1. **Day 0 — Welcome:** Connect education, workforce development and talent growth. CTA: identify a priority population or challenge.
2. **Day 2 — Insight:** Outline programme design questions: target group, baseline, outcomes, support and follow-up. CTA: request a programme-scoping checklist.
3. **Day 5 — Approach:** Describe a scoped pilot with objectives, deliverables, privacy and evaluation agreed in advance. CTA: discuss a pilot.
4. **Day 8 — Invitation:** Propose a 20–30 minute discovery meeting to understand context and constraints. CTA: request a meeting.
5. **Day 13 — Decision support:** Explain how a proposal defines scope, responsibilities, timeline, measurement and costs before commitment. CTA: request a tailored concept note.

### Segment F — Internationally mobile professionals and migrants
1. **Day 0 — Welcome:** Make existing experience understandable in a new labour market. CTA: choose target country/role context.
2. **Day 2 — Transferable skills:** Translate responsibilities into skills and achievements without changing facts or credentials. CTA: map transferable skills.
3. **Day 5 — Market research:** Verify role requirements and employer expectations from current, reputable sources. CTA: choose a target role for review.
4. **Day 8 — Service invitation:** Explore CV/profile and career coaching support for cross-border transitions. CTA: review service options.
5. **Day 13 — Trust and limits:** CareerDev Global supports career preparation, not immigration legal advice, visa decisions, placement guarantees or job offers. CTA: request career support or reply with a question.

## Customer retention lifecycle
- **Onboarding:** send service-specific next steps, required inputs, owner, expected timeline and support route.
- **Progress:** send a clear status update when the work changes stage; do not send empty “checking in” emails.
- **Completion:** deliver work, explain access and offer a structured review/correction process consistent with published terms.
- **Outcome follow-up:** at 7–14 days, ask whether the deliverable was useful and what remains unresolved.
- **Repeat value:** at 30–45 days, offer a relevant next step only where useful (CV to LinkedIn; career assessment to learning plan; leadership coaching to review session).
- **Referral/review:** ask only after value has been delivered; never condition service quality on a positive review.
- **Win-back:** only for contacts who remain subscribed; offer one useful resource and a clear preference/unsubscribe option.

## Brevo setup plan

### Lists and segmentation
Existing lists found: CareerDev Global – Client Testers (ID 4), CareerDev Global – Coach Testers (ID 5), and Your first list (ID 2). Do not use these lists for broad sales campaigns by default. Create dedicated marketing lists or segment by explicit consent plus attributes:
- AUDIENCE_SEGMENT: student_graduate / professional / executive / coach / institution / international_mobility
- MARKETING_CONSENT: yes/no
- CONSENT_DATE, CONSENT_SOURCE, CONSENT_TOPIC
- CUSTOMER_STAGE: prospect / lead / customer / repeat_customer / partner
- LIFECYCLE_STATUS: acquisition / onboarding / active_customer / retention / suppressed
- LEAD_SOURCE, LANDING_PAGE, UTM_SOURCE, UTM_MEDIUM, UTM_CAMPAIGN
- LAST_PURCHASE_DATE, LAST_SERVICE_CATEGORY (only if available and necessary)

Map fields deliberately to attributes supported by the actual Brevo account. Never overwrite an explicit no-consent/suppression state during sync. Synchronize unsubscribe between website, CRM and Brevo.

### Automation workflows to configure
1. Marketing consent confirmed + segment assigned → send segment-specific Day 0 email.
2. Wait 2 days → send Day 2 email only if still subscribed, no purchase/meeting, and eligible.
3. Wait 3 days → Day 5 email under the same eligibility checks.
4. Wait 3 days → Day 8 offer under the same eligibility checks.
5. Wait 5 days → Day 13 objection/next-step email under the same eligibility checks.
6. Purchase, booking, unsubscribe, complaint, hard bounce or suppression → exit or suppress promotional sequence as appropriate.
7. Customer lifecycle events → separate strictly transactional service emails; keep promotional cross-sell content out of essential notices.
8. Completed service → feedback request; never imply a positive review is required.
9. Institution lead → create/assign a sales task and notify the responsible owner rather than placing a multi-stakeholder deal into a generic consumer funnel.

### Sender and deliverability
- Use a verified company-domain sender and reply-to address after the domain is purchased and authenticated (SPF, DKIM and DMARC). The current Gmail sender is temporary, not the preferred production identity.
- Configure a recognizable sender name, real reply monitoring and working company contact details.
- Include Brevo-managed unsubscribe/preferences links in every marketing email.
- Separate marketing consent from transactional service messages. Promotional content remains marketing even when sent by automation.
- Confirm local legal requirements for target jurisdictions, privacy notice, data retention and international transfers.
- Warm sending volume gradually; never upload scraped/purchased lists or bulk-send to people without a lawful basis and applicable consent.

## Measurement and review cadence
Weekly: new consented leads by segment/source; qualified leads; booked consultations; orders; paid orders; refunds; revenue by currency; conversion by cohort; unsubscribes; hard bounces; complaints; delivery time; customer feedback.
Monthly: revenue and contribution by segment/service; cost per qualified lead and customer where ad costs exist; repeat purchase; referral rate; service quality; lost-lead reasons.
Do not optimize on opens alone. Use clicks, replies, qualified conversations, bookings, purchases, retention and customer outcomes. Handle tracking/analytics consent according to recipient jurisdiction and settings.

## Sales process and ownership
1. **Attract:** authority content answers real audience questions and links to a relevant resource/service.
2. **Capture:** landing page collects only necessary information and explicit optional marketing consent.
3. **Qualify:** classify audience, need, urgency, budget/fit where appropriate, and preferred contact channel.
4. **Convert:** recommend a clearly scoped service or discovery call; publish price/currency, deliverables, timelines and limits.
5. **Deliver:** confirm payment from server-side/provider evidence, assign an owner, track milestones and quality review.
6. **Retain:** measure usefulness, address unresolved issues, and recommend only relevant next steps.
7. **Learn:** review funnel metrics and customer feedback weekly; update content and offers based on evidence.

## Launch readiness checklist
- [ ] Verified company-domain sender and authentication.
- [ ] Dedicated segment lists/attributes created and field mapping reviewed.
- [ ] Consent source/date/topic stored and tested end to end.
- [ ] Six sequence drafts reviewed for brand voice, accuracy and service/CTA URLs.
- [ ] Brevo workflows configured with delays, exit rules and suppression.
- [ ] Purchase/booking/unsubscribe/complaint/hard-bounce exits tested.
- [ ] Client/coach tester lists kept separate from marketing audiences.
- [ ] Service pricing, scope, refund/revision policy, privacy notice and contact details published.
- [ ] Test messages delivered to internal seed inboxes across mobile/desktop email clients.
- [ ] Analytics and campaign attribution tested with synthetic data.
- [ ] Launch owner approves activation and a pause/rollback plan.

## Activation boundary
This plan and any campaign drafts are preparation assets. Do not activate workflows, schedule campaigns, send bulk email, or treat unverified leads as marketing subscribers until consent, sender authentication, segment mapping, content links and test gates are verified.
