import assert from 'node:assert/strict';
import test from 'node:test';
import { filterHelpGroups } from '../app/help-center/search.ts';
import { helpGroups } from '../app/help-center/help-groups.ts';

test('help search finds relevant answer text and removes unrelated topics', () => {
  const result = filterHelpGroups(helpGroups, 'portability');
  assert.equal(result.length, 0);
  const found = filterHelpGroups(helpGroups, 'delete');
  assert.ok(found.some(g => g.items.some(([question]) => question.includes('delete'))));
  assert.ok(found.every(g => g.items.every(([q, a]) => `${g.title} ${q} ${a}`.toLowerCase().includes('delete'))));
});

test('help search is case insensitive and supports multiple words', () => {
  const found = filterHelpGroups(helpGroups, '  AI   CAREER  ');
  assert.ok(found.length > 0);
  assert.deepEqual(found, filterHelpGroups(helpGroups, 'ai career'));
});

test('empty search restores every topic without mutating the source', () => {
  const before = JSON.stringify(helpGroups);
  filterHelpGroups(helpGroups, 'coach');
  assert.equal(JSON.stringify(helpGroups), before);
  assert.deepEqual(filterHelpGroups(helpGroups, '   '), helpGroups);
});

test('no matches and punctuation return an empty result safely', () => {
  assert.deepEqual(filterHelpGroups(helpGroups, 'refund'), []);
  assert.deepEqual(filterHelpGroups(helpGroups, '[.*]'), []);
});
