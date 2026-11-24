const LINKEDIN_HOME = "https://www.linkedin.com/";

export const LEAD_STATUS_OPTIONS = Object.freeze([
  "Needs review",
  "Potential fit",
  "Not a fit",
]);

export function buildLinkedInSearchTerms(criteria = {}) {
  const terms = [criteria.keywords, criteria.jobTitles, criteria.company, criteria.location]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  if (!terms.length) throw new Error("Enter at least one search term before opening LinkedIn.");
  return terms.join(" ");
}

export const LINKEDIN_HOME_URL = LINKEDIN_HOME;

export function createLeadReport(leads = [], criteria = {}, generatedAt = new Date().toISOString()) {
  const count = (predicate) => leads.filter(predicate).length;
  const uniqueProfiles = new Set(leads.map((lead) => String(lead.linkedinUrl || "").trim().toLowerCase()).filter(Boolean));
  return {
    generatedAt,
    searchCriteria: [criteria.keywords, criteria.jobTitles, criteria.company, criteria.location].map((value) => String(value || "").trim()).filter(Boolean).join(" | "),
    totalLeads: leads.length,
    potentialFits: count((lead) => lead.status === "Potential fit"),
    needsReview: count((lead) => lead.status === "Needs review"),
    notAFit: count((lead) => lead.status === "Not a fit"),
    consentConfirmed: count((lead) => lead.contactPermission === "Consent confirmed"),
    permissionUnknown: count((lead) => lead.contactPermission !== "Consent confirmed"),
    duplicateProfileUrls: leads.filter((lead) => String(lead.linkedinUrl || "").trim()).length - uniqueProfiles.size,
    humanReviewRequired: true,
    summary: "Manually recorded leads only. Verify fit, identity, lawful basis, and consent before outreach or sharing.",
  };
}

function safeCell(value) {
  let text = String(value ?? "");
  if (/^[\u0000-\u0020]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function toSpreadsheetCsv(rows, columns) {
  const lines = [columns.map((column) => safeCell(column.label)).join(",")];
  for (const row of rows) lines.push(columns.map((column) => safeCell(row[column.key])).join(","));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

