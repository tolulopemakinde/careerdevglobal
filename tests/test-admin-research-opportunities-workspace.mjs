import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildOpportunitySearchTerms, createOpportunityReport } from '../lib/admin/research-opportunities-workspace.mjs';

test('prepares search terms locally and rejects an empty scope', () => {
  assert.equal(buildOpportunitySearchTerms({ keywords: 'youth livelihoods', opportunityType: 'fellowship', geography: 'Nigeria' }), 'youth livelihoods fellowship Nigeria');
  assert.throws(() => buildOpportunitySearchTerms({}), /at least one research term/);
});

test('report counts human source checks, deadline checks, and duplicate URLs', () => {
  const report = createOpportunityReport([
    { sourceUrl: 'https://example.org/a', sourceReview: 'Source checked', deadline: '2027-01-15', deadlineReview: 'Deadline checked' },
    { sourceUrl: 'https://example.org/a', sourceReview: 'Not reviewed', deadline: '', deadlineReview: 'Not reviewed' },
    { sourceUrl: 'https://example.org/b', sourceReview: 'Source checked', deadline: '2027-03-01', deadlineReview: 'Not reviewed' },
  ], { keywords: 'youth livelihoods' }, '2026-11-24T00:00:00.000Z');
  assert.equal(report.totalOpportunities, 3);
  assert.equal(report.sourceChecked, 2);
  assert.equal(report.deadlinesChecked, 1);
  assert.equal(report.deadlinesUnverified, 2);
  assert.equal(report.noDeadlineListed, 1);
  assert.equal(report.duplicateSourceUrls, 1);
  assert.equal(report.humanReviewRequired, true);
});

test('workspace preserves manual search and keeps opportunity records session-local', async () => {
  const ui = await readFile(new URL('../app/admin/research-opportunities-workspace.tsx', import.meta.url), 'utf8');
  const admin = await readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');
  assert.match(ui, /Open web search and copy terms/);
  assert.match(ui, /does not scrape websites/);
  assert.match(ui, /navigator\.clipboard\.writeText/);
  assert.match(ui, /Export opportunity list CSV/);
  assert.match(ui, /Export report CSV/);
  assert.match(ui, /Operational execution is disabled until the agent is status live/);
  assert.match(ui, /Synthetic excerpts only\. This test does not search the web/);
  assert.match(ui, /runResearchOpportunitiesDraft/);
  assert.match(ui, /All entries unverified/);
  assert.match(ui, /Do not treat these as current or real opportunities/);
  const helper = await readFile(new URL('../lib/admin/research-opportunities-operational.mjs', import.meta.url), 'utf8');
  assert.match(helper, /request_ai_agent_execution/);
  assert.match(helper, /prepare_ai_agent_execution/);
  assert.match(helper, /careerdev-ai-agent-runtime/);
  assert.match(helper, /verification_status === 'unverified'/);
  assert.match(helper, /researchDraftToMarkdown/);
  assert.match(admin, /a\.agent_key==='research_opportunities_ai'.*Initiate Research & Opportunities/);
});
