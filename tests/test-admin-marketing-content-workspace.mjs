import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createMarketingContentPreview, marketingContentPreviewToMarkdown } from '../lib/admin/marketing-content-workspace.mjs';

const fixture = { topic: 'career planning', audience: 'early-career professionals', cta: 'Explore the career resources', brandGuidance: 'Use practical, supportive language.' };

test('Marketing Content preview satisfies the content and review contract using supplied synthetic inputs', () => {
  const preview = createMarketingContentPreview(fixture, '2026-11-24T00:00:00.000Z');
  assert.equal(preview.status, 'testing_preview');
  assert.match(preview.content, /early-career professionals/);
  assert.match(preview.content, /career planning/);
  assert.match(preview.repurposing[0].draft, /Explore the career resources/);
  assert.match(preview.qualitySummary, /unsupported statistics, promises/);
  assert.equal(preview.humanReviewRequired, true);
  assert.match(marketingContentPreviewToMarkdown(preview), /not been fact-checked, saved, published, or sent/);
});

test('missing fields and oversized synthetic inputs return useful errors', () => {
  assert.throws(() => createMarketingContentPreview({ ...fixture, topic: '' }), /enter topic/i);
  assert.throws(() => createMarketingContentPreview({ ...fixture, cta: 'x'.repeat(401) }), /400 characters or fewer/i);
});

test('dedicated initiation workspace is Staff/Admin-gated and has no provider, network, runtime, or database call', async () => {
  const admin = await readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');
  const workspace = await readFile(new URL('../app/admin/marketing-content-workspace.tsx', import.meta.url), 'utf8');
  assert.match(admin, /a\.agent_key==='marketing_content_ai'&&\(userRole==='staff'\|\|isAdmin\)/);
  assert.match(admin, /marketingContentOpen&&\(userRole==='staff'\|\|isAdmin\)/);
  assert.match(admin, /Initiate Marketing Content AI/);
  assert.match(workspace, /createMarketingContentPreview\(input\)/);
  assert.doesNotMatch(workspace, /\bfetch\s*\(|supabase\.(rpc|from|functions)\s*\(|careerdev-ai-agent-runtime|createOpenAI|createGroq/i);
});
