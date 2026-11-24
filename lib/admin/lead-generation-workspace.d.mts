export const LEAD_STATUS_OPTIONS: readonly string[];
export const LINKEDIN_HOME_URL: string;
export function buildLinkedInSearchTerms(criteria?: { keywords?: string; jobTitles?: string; company?: string; location?: string }): string;
export function createLeadReport(leads?: Array<Record<string, any>>, criteria?: Record<string, string>, generatedAt?: string): Record<string, any>;
export function toSpreadsheetCsv(rows: Array<Record<string, any>>, columns: Array<{ key: string; label: string }>): string;
