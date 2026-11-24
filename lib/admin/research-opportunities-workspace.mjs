export function buildOpportunitySearchTerms(criteria = {}) {
  const parts = [criteria.keywords, criteria.opportunityType, criteria.geography, criteria.targetProfile]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  if (!parts.length) throw new Error("Enter at least one research term before opening web search.");
  return parts.join(" ");
}

export function createOpportunityReport(opportunities = [], criteria = {}, generatedAt = new Date().toISOString()) {
  const uniqueSources = new Set(opportunities.map((item) => String(item.sourceUrl || "").trim().toLowerCase()).filter(Boolean));
  const validDeadlines = opportunities.filter((item) => item.deadline && item.deadlineReview === "Deadline checked").length;
  return {
    generatedAt,
    searchCriteria: [criteria.keywords, criteria.opportunityType, criteria.geography, criteria.targetProfile].map((value) => String(value || "").trim()).filter(Boolean).join(" | "),
    totalOpportunities: opportunities.length,
    sourceChecked: opportunities.filter((item) => item.sourceReview === "Source checked").length,
    deadlinesChecked: validDeadlines,
    deadlinesUnverified: opportunities.filter((item) => !item.deadline || item.deadlineReview !== "Deadline checked").length,
    noDeadlineListed: opportunities.filter((item) => !item.deadline).length,
    duplicateSourceUrls: opportunities.filter((item) => String(item.sourceUrl || "").trim()).length - uniqueSources.size,
    humanReviewRequired: true,
    summary: "Manually collected opportunity records only. Reopen primary sources and recheck eligibility and deadlines before sharing or acting.",
  };
}
