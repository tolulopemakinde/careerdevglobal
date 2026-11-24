import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('testing-state Marketing Content AI cannot start the governed live runtime from Blog Management', async () => {
  const source = await readFile(new URL('../app/admin/blog/page.tsx', import.meta.url), 'utf8');
  const guard = source.indexOf('agent?.status !== "active"');
  const request = source.indexOf('request_ai_agent_execution');
  const runtime = source.indexOf('careerdev-ai-agent-runtime');
  assert.ok(guard >= 0 && request > guard && runtime > request);
  assert.match(source, /agent\?\.active !== true/);
  assert.match(source, /agent\?\.human_approval_required !== true/);
  assert.match(source, /marketingAgent\?\.status === "active" && marketingAgent\?\.active === true && marketingAgent\?\.human_approval_required === true/);
});

test('synthetic Marketing Content preview is local, unpersisted, and requires human review', async () => {
  const source = await readFile(new URL('../app/admin/blog/page.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('function runSyntheticContentPreview()');
  const end = source.indexOf('async function generateAIDraft()', start);
  assert.ok(start >= 0 && end > start);
  const handler = source.slice(start, end);
  assert.doesNotMatch(handler, /supabase\.|\bfetch\s*\(|request_ai_agent_execution|prepare_ai_agent_execution/);
  assert.match(handler, /setMockDraft\(syntheticContentPreview\)/);
  assert.match(source, /human_review_required: true/);
  assert.match(source, /Run synthetic content preview/);
  assert.match(source, /not saved, published, or sent to an AI provider/);
});

test('Blog Management remains Admin-only', async () => {
  const source = await readFile(new URL('../app/admin/blog/page.tsx', import.meta.url), 'utf8');
  assert.match(source, /role\?\.role !== "admin"/);
});
