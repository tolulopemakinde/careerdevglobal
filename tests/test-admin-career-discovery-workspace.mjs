import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { careerDiscoveryPreviewToMarkdown, createCareerDiscoveryPreview } from '../lib/admin/career-discovery-workspace.mjs';

const fixture = { education: 'BA Sociology', experience: '2 years youth programme support', skills: 'facilitation, reporting', goal: 'explore programme coordination', roleTargets: 'Programme Officer, Project Assistant' };

test('preview maps supplied synthetic inputs into the expected Career Discovery output contract', () => {
  const preview = createCareerDiscoveryPreview(fixture, '2026-11-24T00:00:00.000Z');
  assert.equal(preview.status, 'testing_preview');
  assert.equal(preview.input.skills.length, 2);
  assert.equal(preview.targetRoles.length, 2);
  assert.match(preview.careerDirection, /explore programme coordination/);
  assert.ok(preview.recommendations.length >= 1);
  assert.ok(preview.gaps.length >= 1);
  assert.equal(preview.humanReviewRequired, true);
  assert.match(careerDiscoveryPreviewToMarkdown(preview), /does not infer qualifications, verify evidence/);
});

test('required inputs, empty skills, and oversized fields return actionable errors', () => {
  assert.throws(() => createCareerDiscoveryPreview({ ...fixture, goal: '  ' }), /enter career goal/i);
  assert.throws(() => createCareerDiscoveryPreview({ ...fixture, skills: ' , ' }), /at least one skill/i);
  assert.throws(() => createCareerDiscoveryPreview({ ...fixture, education: 'x'.repeat(501) }), /500 characters or fewer/i);
});

test('Admin workspace is role-gated and its submit path has no provider, network, or database call', async () => {
  const admin = await readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');
  const workspace = await readFile(new URL('../app/admin/career-discovery-workspace.tsx', import.meta.url), 'utf8');
  assert.match(admin, /a\.agent_key==='career_discovery_ai'&&\(userRole==='staff'\|\|isAdmin\)/);
  assert.match(admin, /careerDiscoveryOpen&&\(userRole==='staff'\|\|isAdmin\)/);
  assert.match(workspace, /createCareerDiscoveryPreview\(input\)/);
  assert.doesNotMatch(workspace, /\bfetch\s*\(|supabase\.(rpc|from|functions)\s*\(|careerdev-ai-agent-runtime|createOpenAI|createGroq/i);
});
