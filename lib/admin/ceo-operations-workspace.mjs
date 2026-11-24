export function createExecutiveReview(input = {}, generatedAt = new Date().toISOString()) {
  const period = String(input.period || "").trim();
  const target = Number(input.target);
  const completed = Number(input.completed);
  const qualityScore = Number(input.qualityScore);
  if (!period) throw new Error("A reporting period is required.");
  if (!Number.isFinite(target) || target <= 0 || !Number.isFinite(completed) || completed < 0 || completed > target) {
    throw new Error("Completed outcomes and target must be valid aggregate counts, with completed between zero and the target.");
  }
  if (!Number.isFinite(qualityScore) || qualityScore < 0 || qualityScore > 100) {
    throw new Error("Quality score must be a synthetic aggregate value from 0 to 100.");
  }
  const completionRate = Math.round((completed / target) * 100);
  const risks = [];
  const actions = [];
  if (completed < target) {
    risks.push("Aggregate delivery is below the entered target; confirm the underlying evidence and context.");
    actions.push("Review delivery barriers and agree corrective actions with the accountable team.");
  }
  if (qualityScore < 70) {
    risks.push("The entered aggregate quality score is below the review threshold.");
    actions.push("Validate the quality measure and identify support or process changes.");
  }
  if (!risks.length) risks.push("No threshold flag was raised by the supplied synthetic aggregate values.");
  if (!actions.length) actions.push("Have a human reviewer confirm source data and maintain the current review cadence.");
  return {
    generatedAt,
    period,
    target,
    completed,
    completionRate,
    qualityScore,
    risks,
    actions,
    evidenceBoundary: "This summary uses only values entered by an Admin. It does not verify source records and does not assess individual staff performance.",
    humanReviewRequired: true,
    status: "testing_preview",
  };
}

export function executiveReviewToMarkdown(review) {
  return [
    `# Executive operations review — ${review.period}`,
    `\nGenerated: ${review.generatedAt}`,
    `\n## Aggregate indicators\n- Outcomes: ${review.completed} / ${review.target}\n- Completion: ${review.completionRate}%\n- Quality score: ${review.qualityScore}%`,
    `\n## Risks to review\n${review.risks.map((item) => `- ${item}`).join("\n")}`,
    `\n## Suggested actions\n${review.actions.map((item) => `- ${item}`).join("\n")}`,
    `\n## Evidence and review\n${review.evidenceBoundary}\nHuman review required: yes. Testing preview only.`,
  ].join("\n");
}
