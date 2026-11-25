import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceCareerCoachSession } from '../lib/ai/career-coach-session.ts';

test('saving the goal advances to the barrier and all four answers reach plan review', () => {
  let saved = advanceCareerCoachSession(0, [' Move into operations ', '', '', '']);
  assert.deepEqual(saved, { next_step: 1, answers: ['Move into operations', '', '', ''] });
  saved = advanceCareerCoachSession(saved.next_step, [saved.answers[0], 'Limited evidence', '', '']);
  assert.equal(saved.next_step, 2);
  saved = advanceCareerCoachSession(saved.next_step, [...saved.answers.slice(0, 2), 'Document one workflow', '']);
  assert.equal(saved.next_step, 3);
  saved = advanceCareerCoachSession(saved.next_step, [...saved.answers.slice(0, 3), 'One reviewed process diagram']);
  assert.equal(saved.next_step, 4);
  assert.equal(saved.answers[3], 'One reviewed process diagram');
});

test('missing, oversized, and out-of-order answers do not advance the workflow', () => {
  assert.throws(() => advanceCareerCoachSession(0, ['   ', '', '', '']), /Add a short answer/);
  assert.throws(() => advanceCareerCoachSession(2, ['Goal', ' ', 'Action', '']), /Add a short answer/);
  assert.throws(() => advanceCareerCoachSession(0, ['a'.repeat(2001), '', '', '']), /2,000/);
  assert.throws(() => advanceCareerCoachSession(4, ['Goal', 'Barrier', 'Action', 'Evidence']), /current coaching step/);
});
