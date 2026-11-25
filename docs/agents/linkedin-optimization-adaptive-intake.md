# LinkedIn Optimization Agent — Adaptive Intake and Evidence-Grounded Output

## Purpose

Improve the LinkedIn Optimization Agent so it uses available Career Intelligence Profile context first, then asks the user focused follow-up questions only when important information is missing, ambiguous, stale, or unsupported. Do not make users repeat information already available and authorized for this task.

This document defines the intended behavior and acceptance criteria. It does not itself activate the agent, change Supabase configuration, or deploy runtime code.

## User experience

1. Explain briefly what the agent will produce and that the user can skip questions they cannot answer.
2. Read only the Career Intelligence Profile fields and documents the authenticated user is authorized to use for this request.
3. Assess which required facts are present, missing, ambiguous, or need confirmation.
4. Ask a small, prioritized set of follow-up questions. Ask one question at a time where practical, or group closely related questions into a compact intake step.
5. Use the user's answers to prepare a draft LinkedIn profile and a short list of recommendations.
6. Show assumptions and unresolved gaps explicitly. Never fill missing details with invented facts.
7. Allow the user to edit, confirm, or skip non-essential details. Require confirmation before presenting uncertain or potentially consequential claims as facts.
8. Keep generated content as a draft for user/coach review; do not publish to LinkedIn or modify a LinkedIn account automatically.

## Information to check before asking

Reuse information already available in the authorized Career Intelligence Profile, uploaded CV/resume, supplied LinkedIn text, and this session:

- current or intended professional identity and career level;
- target role(s), industry, sector, geography, and audience;
- employment history, dates, responsibilities, achievements, and measurable outcomes;
- education, credentials, licences, certifications, projects, volunteering, and publications;
- skills, tools, domain expertise, and evidence of those skills;
- career goals and preferred opportunities;
- existing LinkedIn headline, About section, experience entries, skills, Featured content, and public-facing links if the user supplies them;
- preferred tone, language, and any details the user does not want emphasized.

Only use data that is actually available and authorized. Do not imply that the agent can access LinkedIn directly unless an approved integration explicitly provides that capability.

## Adaptive follow-up question bank

Ask only the questions needed for the user's chosen optimization goal. Examples:

### Goal and audience
- What would you most like LinkedIn to help you achieve: a new job, career transition, consulting clients, leadership opportunities, networking, academic opportunities, or another goal?
- Which role(s), industry/sector, and country or job market are you targeting?
- Who should your profile speak to most: recruiters, hiring managers, clients, collaborators, funders, or peers?

### Evidence and achievements
- Which 2–3 accomplishments best demonstrate your value? Include figures or outcomes only if you can verify them.
- What changed because of your work (for example, people served, time saved, revenue, programme outcomes, quality, or delivery)?
- Are there projects, publications, portfolios, or work samples you want to feature?
- Are any employment dates, job titles, credentials, or achievement statements uncertain and in need of confirmation?

### Skills and positioning
- Which skills or tools do you most want to be found for?
- What makes your approach or experience distinctive for the target role?
- Which transferable skills should be emphasized if you are changing careers or markets?

### Profile sections and preferences
- Can you paste your current headline, About section, and relevant experience entries, or provide a profile export/screenshot/text you are comfortable sharing?
- Are there certifications, projects, volunteer roles, or Featured links missing from your current profile?
- What tone do you prefer (for example, concise, executive, approachable, technical, or impact-focused)?
- Is there anything you want omitted or kept private?

### Optional final confirmation
- May the agent use the supplied facts to draft profile copy for your review?
- Would you like a broad profile refresh or optimization against a specific job description? If a specific role is selected, request the job description or a link/text excerpt.

## Recommended output contract

The agent should return structured sections:

1. **Profile audit** — strengths, gaps, and high-priority changes.
2. **Positioning summary** — target audience, professional value proposition, and chosen emphasis.
3. **Headline options** — several truthful alternatives.
4. **About section** — a polished draft grounded in confirmed facts.
5. **Experience rewrites** — role-by-role drafts using only supplied/verified responsibilities and achievements.
6. **Skills and keyword suggestions** — relevant terms, with a note that keyword suggestions are not a guarantee of search ranking.
7. **Other section recommendations** — Featured, projects, certifications, volunteering, recommendations, portfolio, and profile banner where relevant.
8. **Evidence and confirmation list** — claims needing user verification, missing dates/metrics, or unresolved ambiguity.
9. **Action checklist** — prioritized edits and a simple way for the user to review/copy each draft.

Each output claim should be traceable to user-supplied or authorized source information where feasible. If evidence is absent, phrase it as a question or suggestion, not a fact.

## Privacy, safety, and governance

- Ask for only information relevant to the requested profile optimization.
- Do not request passwords, login codes, private messages, or unnecessary sensitive personal information.
- Tell users not to share confidential employer/client data or information they lack permission to disclose.
- Respect the user's choice to skip a question and mark the related output as limited if necessary.
- Do not invent degrees, certifications, job titles, employers, dates, metrics, endorsements, publications, or professional achievements.
- Do not guarantee recruiter attention, job offers, LinkedIn ranking, or employment outcomes.
- Keep outputs subject to existing AI governance, quality checks, human-review requirements, and release gates.
- Preserve agent entitlements, credit controls, auditability, and human-review requirements. Do not bypass the governed runtime.
- Any access to stored profile data must be server-authorized and follow existing Supabase RLS/ownership controls.
- No automatic publishing or external LinkedIn account mutation.

## Acceptance criteria

- [ ] The agent reuses available authorized profile data and does not ask the user to repeat it unnecessarily.
- [ ] Missing information is detected before final profile copy is generated.
- [ ] Follow-up questions are relevant to the user's chosen goal and limited to material gaps.
- [ ] Users can skip non-essential questions; the agent records resulting limitations rather than fabricating facts.
- [ ] A target job description is optional, but requested when job-specific optimization is selected and none is supplied.
- [ ] Every achievement, credential, date, and metric in generated copy is grounded in supplied evidence or clearly flagged for confirmation.
- [ ] The output includes profile drafts, a prioritized audit, keyword suggestions, and an evidence/verification list.
- [ ] The UI clearly distinguishes generated draft text from user-confirmed facts.
- [ ] The agent does not publish or modify LinkedIn directly.
- [ ] Existing authorization, subscription/entitlement, credit, logging, quality, and human-review controls remain intact.
- [ ] Unit/integration tests cover complete profiles, partial profiles, missing target role, career changers, students/graduates with limited experience, contradictory dates, unverified metrics, skipped questions, and provider/credit failure.
- [ ] Tests run in an isolated preview/test environment before any production activation or deployment.

## Rollout sequence

1. Verify the current LinkedIn agent registry entry, prompt/configuration source, intake/question workflow, runtime schema, and test harness.
2. Implement adaptive intake in the existing governed workflow; do not create a parallel or bypass path.
3. Add tests for missing-information detection, non-repetition, evidence grounding, and skip behavior.
4. Run governed test executions and quality/security review.
5. Submit the results for human approval and release-candidate evaluation.
6. Activate or deploy only after the existing release gates pass and production verification is explicitly authorized.
