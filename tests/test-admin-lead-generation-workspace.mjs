import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLinkedInSearchTerms, LINKEDIN_HOME_URL, createLeadReport, toSpreadsheetCsv } from '../lib/admin/lead-generation-workspace.mjs';

test('prepares search terms and opens only LinkedIn home without making a request', () => {
  assert.equal(buildLinkedInSearchTerms({ keywords: 'career coach', jobTitles: 'HR Director', location: 'Lagos & Abuja' }), 'career coach HR Director Lagos & Abuja');
  assert.equal(LINKEDIN_HOME_URL, 'https://www.linkedin.com/');
  assert.throws(() => buildLinkedInSearchTerms({}), /at least one search term/);
});

test('report counts status, permission, and duplicate profile URLs and requires review', () => {
  const report = createLeadReport([
    { linkedinUrl: 'https://www.linkedin.com/in/a', status: 'Potential fit', contactPermission: 'Consent confirmed' },
    { linkedinUrl: 'https://www.linkedin.com/in/a', status: 'Needs review', contactPermission: 'Unknown' },
    { linkedinUrl: '', status: 'Not a fit', contactPermission: 'Do not contact' },
  ], { keywords: 'programme director' }, '2026-11-24T00:00:00.000Z');
  assert.equal(report.totalLeads, 3);
  assert.equal(report.potentialFits, 1);
  assert.equal(report.needsReview, 1);
  assert.equal(report.notAFit, 1);
  assert.equal(report.consentConfirmed, 1);
  assert.equal(report.permissionUnknown, 2);
  assert.equal(report.duplicateProfileUrls, 1);
  assert.equal(report.humanReviewRequired, true);
  assert.equal(report.searchCriteria, 'programme director');
});

test('CSV quotes content and neutralizes spreadsheet formulas', () => {
  const csv = toSpreadsheetCsv([{ name: '=HYPERLINK("bad")', notes: 'a, "quoted" note' }], [
    { key: 'name', label: 'Name' }, { key: 'notes', label: 'Notes' },
  ]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.match(csv, /"'\=HYPERLINK\(""bad""\)"/);
  assert.match(csv, /"a, ""quoted"" note"/);
});

test('workspace keeps LinkedIn access manual and lead records session-local', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../app/admin/lead-generation-workspace.tsx', import.meta.url), 'utf8');
  assert.match(source, /Open LinkedIn and copy search terms/);
  assert.match(source, /navigator\.clipboard\.writeText/);
  assert.match(source, /scrape profiles/);
  assert.match(source, /setLeads\(\(current\)/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|fetch\s*\(|supabase\./);
  assert.match(source, /Export lead list CSV/);
  assert.match(source, /Export report CSV/);
});
