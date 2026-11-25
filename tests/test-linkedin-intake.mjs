import test from 'node:test';
import assert from 'node:assert/strict';
import { formatLinkedInRequest, restoreLinkedInRequest } from '../lib/ai/linkedin-intake.ts';

test('LinkedIn intake is optional and round-trips multiline profile evidence', () => {
  assert.equal(formatLinkedInRequest(' Improve profile ', {}), 'Improve profile');
  const intake = { target: 'Operations analyst', profile: 'Current headline\nSynthetic experience' };
  assert.deepEqual(restoreLinkedInRequest(formatLinkedInRequest('Improve profile', intake)), { request: 'Improve profile', intake });
});

test('editing a reopened request replaces its prior preferences and preserves plain legacy requests', () => {
  const saved = restoreLinkedInRequest(formatLinkedInRequest('Improve profile', { tone: 'technical', goal: 'job search' }));
  const edited = formatLinkedInRequest(saved.request, { ...saved.intake, tone: 'direct', goal: '' });
  assert.doesNotMatch(edited, /technical|job search/);
  assert.deepEqual(restoreLinkedInRequest(edited), { request: 'Improve profile', intake: { tone: 'direct' } });
  const legacy = 'Written request\n\n[CareerDev LinkedIn intake]\nUnstructured notes';
  assert.deepEqual(restoreLinkedInRequest(legacy), { request: legacy, intake: {} });
});
