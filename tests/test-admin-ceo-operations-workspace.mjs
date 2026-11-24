import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createExecutiveReview, executiveReviewToMarkdown } from '../lib/admin/ceo-operations-workspace.mjs';

const fixture = { period: 'synthetic-Q1', target: 15, completed: 12, qualityScore: 82 };

test('aggregate review calculates completion and flags shortfalls for human review', () => {
  const review = createExecutiveReview(fixture, '2026-11-24T00:00:00.000Z');
  assert.equal(review.completionRate, 80);
  assert.equal(review.status, 'testing_preview');
  assert.equal(review.humanReviewRequired, true);
  assert.ok(review.risks.some((risk) => risk.includes('below the entered target')));
  assert.match(executiveReviewToMarkdown(review), /does not assess individual staff performance/);
});

test('invalid aggregate values are rejected', () => {
  assert.throws(() => createExecutiveReview({ ...fixture, completed: 16 }), /valid aggregate counts/);
  assert.throws(() => createExecutiveReview({ ...fixture, qualityScore: 101 }), /from 0 to 100/);
  assert.throws(() => createExecutiveReview({ ...fixture, period: '' }), /reporting period is required/);
});

test('workspace is Admin-only and does not call a provider, runtime, or database', async () => {
  const ui = await readFile(new URL('../app/admin/ceo-operations-workspace.tsx', import.meta.url), 'utf8');
  const admin = await readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');
  assert.match(admin, /a\.agent_key==='ceo_operations_ai'&&isAdmin/);
  assert.match(admin, /ceoOperationsOpen&&isAdmin&&<CEOOperationsWorkspace/);
  assert.match(ui, /Create aggregate review preview/);
  assert.doesNotMatch(ui, /\bfetch\s*\(|supabase\.|request_ai_agent_execution/);
});
