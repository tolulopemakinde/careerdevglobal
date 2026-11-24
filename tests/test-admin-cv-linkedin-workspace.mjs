import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCvLinkedInPreview, cvLinkedInPreviewToMarkdown } from '../lib/admin/cv-linkedin-workspace.mjs';

const fixture = { targetRole: 'Programme Officer', summary: 'Synthetic programme professional with youth development experience.', experience: 'Coordinated a synthetic youth skills workshop\nPrepared attendance and follow-up summaries', skills: 'facilitation, reporting, project coordination' };

test('CV and LinkedIn drafts use supplied facts and enforce the expected output and review contract', () => {
  const preview = createCvLinkedInPreview(fixture, '2026-11-24T00:00:00.000Z');
  assert.equal(preview.status, 'testing_preview');
  assert.match(preview.cvDraft, /Coordinated a synthetic youth skills workshop/);
  assert.match(preview.linkedinDraft, /Programme Officer \| facilitation/);
  assert.equal(preview.unsupportedClaimsAdded, false);
  assert.equal(preview.humanReviewRequired, true);
  assert.match(cvLinkedInPreviewToMarkdown(preview), /Verify every statement against source documents/);
});

test('missing inputs and oversized source facts are rejected', () => {
  assert.throws(() => createCvLinkedInPreview({ ...fixture, summary: '' }), /enter career summary/i);
  assert.throws(() => createCvLinkedInPreview({ ...fixture, experience: '  ' }), /enter experience evidence/i);
  assert.throws(() => createCvLinkedInPreview({ ...fixture, skills: 'x'.repeat(1501) }), /1500 characters or fewer/i);
});

test('workspace stays local and its initiation control is Staff/Admin-gated', async () => {
  const admin = await readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');
  const workspace = await readFile(new URL('../app/admin/cv-linkedin-workspace.tsx', import.meta.url), 'utf8');
  assert.match(admin, /a\.agent_key==='cv_linkedin_ai'&&\(userRole==='staff'\|\|isAdmin\)/);
  assert.match(admin, /cvLinkedInOpen&&\(userRole==='staff'\|\|isAdmin\)/);
  assert.match(workspace, /createCvLinkedInPreview\(input\)/);
  assert.doesNotMatch(workspace, /\bfetch\s*\(|supabase\.(rpc|from|functions)\s*\(|careerdev-ai-agent-runtime|createOpenAI|createGroq/i);
});
