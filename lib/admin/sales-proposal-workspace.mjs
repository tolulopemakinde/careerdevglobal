function lines(value) {
  return String(value || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function createProposalPreview(input = {}, generatedAt = new Date().toISOString()) {
  const organization = String(input.organization || "").trim();
  const service = String(input.service || "").trim();
  const needs = String(input.needs || "").trim();
  if (!organization || !service || !needs) {
    throw new Error("Organization, service, and needs summary are required to prepare a proposal preview.");
  }
  const priceConfirmed = input.priceStatus === "Confirmed" && String(input.priceDetails || "").trim();
  return {
    generatedAt,
    organization,
    service,
    needs,
    objectives: lines(input.objectives),
    deliverables: lines(input.deliverables),
    timeline: String(input.timeline || "To be agreed after discovery.").trim(),
    pricing: priceConfirmed ? String(input.priceDetails).trim() : "Pricing pending authorized human confirmation.",
    assumptions: lines(input.assumptions),
    exclusions: ["No guaranteed employment, funding, placement, or business outcomes.", "No work outside the agreed scope unless separately approved."],
    nextSteps: ["Confirm requirements, scope, timeline, and pricing with an authorized human.", "Verify all factual and contractual statements.", "Obtain approval before sending or accepting this proposal."],
    humanReviewRequired: true,
    sent: false,
    saved: false,
    mode: "local_synthetic_template",
  };
}

export function proposalPreviewToMarkdown(proposal) {
  const list = (items) => items.length ? items.map((item) => `- ${item}`).join("\n") : "- To be confirmed during discovery.";
  return [
    `# Proposal preview: ${proposal.service}`,
    `\n**Prepared for:** ${proposal.organization}`,
    `\n**Prepared:** ${proposal.generatedAt}`,
    "\n> Synthetic local preview. Human review is required. This file has not been saved to CareerDev Global or sent to anyone.",
    `\n## Needs summary\n${proposal.needs}`,
    `\n## Objectives\n${list(proposal.objectives)}`,
    `\n## Proposed deliverables\n${list(proposal.deliverables)}`,
    `\n## Timeline\n${proposal.timeline}`,
    `\n## Pricing\n${proposal.pricing}`,
    `\n## Assumptions\n${list(proposal.assumptions)}`,
    `\n## Exclusions\n${list(proposal.exclusions)}`,
    `\n## Next steps\n${list(proposal.nextSteps)}`,
  ].join("\n");
}
