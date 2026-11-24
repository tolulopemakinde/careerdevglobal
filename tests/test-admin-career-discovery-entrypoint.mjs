import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Career Discovery has a separate Staff/Admin initiation action on the Admin Agents card', async () => {
  const page = await readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /a\.agent_key==='career_discovery_ai'&&\(userRole==='staff'\|\|isAdmin\)/);
  assert.match(page, /Initiate Career Discovery AI/);
  assert.match(page, /setCareerDiscoveryOpen\(\(open\)=>!open\)/);
});
