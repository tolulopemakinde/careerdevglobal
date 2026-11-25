import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createProposalPreview, proposalPreviewToMarkdown } from '../lib/admin/sales-proposal-workspace.mjs';

test('proposal preview requires organization, service, and needs summary', () => {
  assert.throws(() => createProposalPreview({}), /Organization, service, and needs summary are required/);
});

test('unconfirmed pricing stays pending and proposal excludes guarantees', () => {
  const proposal = createProposalPreview({ organization: 'Synthetic NGO', service: 'Executive coaching', needs: 'Leadership transition support', objectives: 'Set coaching goals\nReview progress', priceStatus: 'Not confirmed', priceDetails: '$100' }, '2026-11-24T00:00:00.000Z');
  assert.equal(proposal.pricing, 'Pricing pending authorized human confirmation.');
  assert.equal(proposal.humanReviewRequired, true);
  assert.equal(proposal.sent, false);
  assert.equal(proposal.saved, false);
  assert.ok(proposal.exclusions.some((item) => item.includes('No guaranteed')));
  assert.match(proposalPreviewToMarkdown(proposal), /Synthetic local preview/);
  assert.match(proposalPreviewToMarkdown(proposal), /Pricing pending authorized human confirmation/);
});

test('confirmed pricing is included only when explicitly marked confirmed', () => {
  const proposal = createProposalPreview({ organization: 'Test Client', service: 'CV review', needs: 'Improve CV clarity', priceStatus: 'Confirmed', priceDetails: 'USD 80' });
  assert.equal(proposal.pricing, 'USD 80');
});

test('Admin proposal workspace keeps the local template separate from the gated Groq draft path', async () => {
  const ui = await readFile(new URL('../app/admin/sales-proposal-workspace.tsx', import.meta.url), 'utf8');
  const admin = await readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');
  assert.match(ui, /Create local proposal preview/);
  assert.match(ui, /Download Markdown preview/);
  assert.match(ui, /Pricing remains pending human confirmation/);
  assert.match(ui, /Operational execution is disabled until the agent is status live/);
  assert.match(ui, /Non-binding draft · Awaiting independent human review/);
  assert.match(ui, /No proposal has been saved, approved, or sent/);
  const helper = await readFile(new URL('../lib/admin/sales-proposal-operational.mjs', import.meta.url), 'utf8');
  assert.match(helper, /request_ai_agent_execution/);
  assert.match(helper, /prepare_ai_agent_execution/);
  assert.match(helper, /careerdev-ai-agent-runtime/);
  assert.match(helper, /pricing/i);
  assert.match(helper, /authorized human confirmation/i);
  assert.match(helper, /salesProposalDraftToMarkdown/);
  assert.match(admin, /a\.agent_key==='sales_proposal_ai'.*Initiate Sales Proposal AI/);
  assert.match(admin, /agentStatus=\{adminAgents\.find\(\(agent:any\)=>agent\.agent_key==='sales_proposal_ai'\)/);
});
