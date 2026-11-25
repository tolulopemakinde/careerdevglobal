const field = (key: string, label: string, hint: string) => ({ key, label, hint });

export const structuredClientCoachAgents = {
  academic_career_transition_agent: {
    name: "Academic and Career Transition",
    fields: [
      field("target", "What transition are you planning?", "Name a role, course, or pathway you want to explore."),
      field("evidence", "What existing study or work supports it?", "Use examples from your studies, work, or training."),
      field("requirements", "Which entry requirements still need checking?", "Use a course or employer's published information, if available."),
    ],
  },
  career_discovery_agent: {
    name: "Career Discovery",
    fields: [
      field("interests", "What kind of work interests you?", "Describe the work itself, not just a job title."),
      field("evidence", "What experience makes that direction worth exploring?", "Use one example from work, study, volunteering, or projects."),
      field("direction", "Which direction would you like to test first?", "Name a role or work setting as a hypothesis."),
    ],
  },
  employer_talent_agent: {
    name: "Employer and Talent",
    fields: [
      field("role", "What role or workforce need are you exploring?", "Describe the work the team needs to do."),
      field("requirements", "What outcomes or capabilities are essential?", "List objective criteria tied to the work. Keep details at the role or team level."),
      field("evidence", "How would you verify those criteria fairly?", "Describe a work sample or consistent assessment method. Leave out names and personal attributes."),
    ],
  },
  job_search_intelligence_agent: {
    name: "Job Search Intelligence",
    fields: [
      field("target", "What roles are you looking for?", "List one or two titles or role families."),
      field("scope", "What location or work arrangement fits?", "Include location, work mode, or relevant constraints."),
      field("criteria", "How will you decide whether to pursue an opening?", "Use criteria such as required skills, responsibilities, or compensation information you can verify."),
    ],
  },
  career_assessment_agent: {
    name: "Career Assessment",
    fields: [
      field("goal", "What are you working toward?", "Name one goal you want to assess."),
      field("strengths", "What strengths could help?", "Use examples from work, study, volunteering, or personal projects."),
      field("evidence", "What evidence can you show?", "Pick a work sample, outcome, or piece of feedback you can verify."),
    ],
  },
  skills_gaps_agent: {
    name: "Skills and Gaps",
    fields: [
      field("target", "What role or goal are you aiming for?", "Use one target so the comparison stays focused."),
      field("required", "What skills does it require?", "Enter one skill per line using the job description or requirements you reviewed."),
      field("supported", "Which of those skills can you demonstrate?", "Enter one skill per line using the same wording where it matches, based on your work or training evidence."),
    ],
  },
  learning_development_agent: {
    name: "Learning and Development",
    fields: [
      field("skill", "What skill do you want to develop?", "Choose one skill you can practise."),
      field("practice", "What could you make or do to practise it?", "Pick a small task with a visible result."),
      field("time", "When can you practise?", "Choose a realistic block of time in the next seven days."),
    ],
  },
  talent_mobility_agent: {
    name: "Talent Mobility",
    fields: [
      field("target", "What move are you considering?", "Enter a role, industry, or type of work."),
      field("location", "Where do you want to work?", "Enter the destination or work arrangement to investigate."),
      field("constraints", "What constraints matter to you?", "For example, timing, budget, or a licence you need to verify. Leave out identity documents and identification numbers."),
    ],
  },
  ethics_quality_assurance_agent: {
    name: "Ethics and Quality Assurance",
    fields: [
      field("claim", "Which claim should you review?", "Enter one claim from a CV, profile, or draft."),
      field("evidence", "What supports it?", "Describe the source and what it actually shows. If you have no evidence yet, say so. Leave out private third-party details."),
    ],
  },
};

export type StructuredAgentKey = keyof typeof structuredClientCoachAgents;

export function isStructuredAgent(key: string): key is StructuredAgentKey {
  return Object.hasOwn(structuredClientCoachAgents, key);
}

export function supportsGuidedWorksheet(dependencyMode: unknown) {
  return dependencyMode === "works_without_ai" || dependencyMode === "ai_optional";
}

export function validateStructuredRequest(key: StructuredAgentKey, request: unknown): Record<string, string> | null {
  if (!request || typeof request !== "object" || Array.isArray(request)) return null;
  const fields = structuredClientCoachAgents[key].fields;
  const data = request as Record<string, unknown>;
  if (Object.keys(data).length !== fields.length) return null;

  const normalized: Record<string, string> = {};
  for (const { key: name } of fields) {
    const value = data[name];
    if (typeof value !== "string" || !value.trim() || value.length > 2000) return null;
    normalized[name] = value.trim();
  }
  return normalized;
}

export function buildStructuredResult(key: StructuredAgentKey, request: Record<string, string>, humanReviewRequired: boolean) {
  let title: string;
  let findings: string[];
  let nextSteps: string[];
  let uncertaintyFlags: string[];
  switch (key) {
    case "academic_career_transition_agent":
      title = "Academic and career transition plan";
      findings = [`Transition under consideration: ${request.target}`, `Existing evidence: ${request.evidence}`, `Requirements to check: ${request.requirements}`];
      nextSteps = ["Compare your evidence with the official admissions or role requirements.", "Choose one open requirement and identify a person or primary source that can clarify it."];
      uncertaintyFlags = ["Admissions, eligibility, and recognition of qualifications need confirmation from the relevant institution or employer."];
      break;
    case "career_discovery_agent":
      title = "Career direction to test";
      findings = [`Work interests: ${request.interests}`, `Experience you identified: ${request.evidence}`, `Direction to explore: ${request.direction}`];
      nextSteps = ["Compare two representative role descriptions and note which responsibilities fit your stated interests.", "Use an informational conversation or small project to test one assumption about the direction."];
      uncertaintyFlags = ["This direction is a hypothesis based on your answers. Verify the role requirements and explore alternatives before committing."];
      break;
    case "employer_talent_agent":
      title = "Role requirements and evidence plan";
      findings = [`Role or team need: ${request.role}`, `Objective requirements you entered: ${request.requirements}`, `Proposed evidence: ${request.evidence}`];
      nextSteps = ["Confirm that each criterion is necessary for the role.", "Define a consistent way to review the same job-relevant evidence for every participant and have the criteria reviewed by an authorized human."];
      uncertaintyFlags = ["This worksheet prepares criteria for human review. Individual candidate evaluation and employment decisions require an authorized process."];
      break;
    case "job_search_intelligence_agent":
      title = "Job search plan";
      findings = [`Target roles: ${request.target}`, `Search scope: ${request.scope}`, `Criteria for deciding whether to apply: ${request.criteria}`];
      nextSteps = ["Search employer career pages using your target roles and scope.", "For any listing you consider, record the employer’s URL, date checked, closing date, and evidence against your criteria."];
      uncertaintyFlags = ["Live openings, dates, and eligibility must be checked on the employer’s posting."];
      break;
    case "career_assessment_agent":
      title = "Career assessment worksheet";
      findings = [`Goal: ${request.goal}`, `Stated strengths: ${request.strengths}`, `Evidence to review: ${request.evidence}`];
      nextSteps = ["Choose the strongest example and connect it to one requirement for your goal.", "Ask a coach for feedback on any requirement your evidence leaves open."];
      uncertaintyFlags = ["The worksheet reflects your answers. A coach can help assess the strength of the evidence."];
      break;
    case "skills_gaps_agent": {
      const lines = (value: string) => [...new Set(value.split("\n").map(line => line.trim().toLowerCase()).filter(Boolean))];
      const required = lines(request.required);
      const supported = new Set(lines(request.supported));
      const matched = required.filter(skill => supported.has(skill));
      const missing = required.filter(skill => !supported.has(skill));
      title = "Skills evidence map";
      findings = [
        `Target: ${request.target}`,
        `Skills you listed evidence for: ${matched.join(", ") || "None matched the wording entered."}`,
        `Skills with evidence still to check: ${missing.join(", ") || "All entered requirements matched."}`,
      ];
      nextSteps = ["Check synonymous skill names and link each match to a specific example.", "Choose one requirement still open and identify a way to demonstrate it."];
      uncertaintyFlags = ["This comparison matches the wording you supplied. An unmatched skill may still have evidence under a different name."];
      break;
    }
    case "learning_development_agent":
      title = "Seven-day learning plan";
      findings = [`Skill: ${request.skill}`, `Practice task: ${request.practice}`, `Practice window: ${request.time}`];
      nextSteps = ["Block the practice time in your calendar.", "Save one example of what you produced and note one improvement for the next session."];
      uncertaintyFlags = ["Adjust the task after the first session if your practice window is shorter than you expected."];
      break;
    case "talent_mobility_agent":
      title = "Mobility research checklist";
      findings = [`Target: ${request.target}`, `Destination or work setup: ${request.location}`, `Constraints to check: ${request.constraints}`];
      nextSteps = ["Check the destination’s official work-authorization and licensing sources where applicable.", "Confirm whether your evidence satisfies one representative employer’s requirements."];
      uncertaintyFlags = ["Work authorization, licensing, demand, and eligibility still need current primary-source verification."];
      break;
    case "ethics_quality_assurance_agent":
      title = "Claim and evidence review";
      findings = [`Claim to review: ${request.claim}`, `Evidence you supplied: ${request.evidence}`];
      nextSteps = ["Compare each factual part of the claim with the original source.", "Remove or qualify any detail the source cannot establish before you share the draft."];
      uncertaintyFlags = ["The source and the truth of the claim still need human verification."];
      break;
  }
  return {
    result: { title, findings, next_steps: nextSteps },
    source_refs: [{ type: "user_input", label: "Answers submitted for this session" }],
    uncertainty_flags: uncertaintyFlags,
    human_review_required: humanReviewRequired,
    generated_by_ai: false,
  };
}
