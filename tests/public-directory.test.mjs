import assert from 'node:assert/strict';
import test from 'node:test';
import { readPublicDirectory } from '../lib/public-directory.ts';

const read = (send) => readPublicDirectory('https://fixture.invalid', 'publishable-fixture', 'get_public_coach_directory', send);

test('anonymous denial and server errors are unavailable, not empty inventory', async () => {
  for (const status of [401, 403, 500, 503]) {
    assert.deepEqual(await read(async () => Response.json({ message: 'private diagnostic' }, { status })),
      { status: 'unavailable', items: [] });
  }
});

test('network failure, invalid JSON and unexpected shapes remain unavailable', async () => {
  for (const send of [async () => { throw new Error('network'); },
    async () => new Response('bad-json'), async () => Response.json({ error: 'unexpected' })]) {
    assert.deepEqual(await read(send), { status: 'unavailable', items: [] });
  }
});

test('a successful empty directory is distinguished from a failed request', async () => {
  assert.deepEqual(await read(async () => Response.json([])), { status: 'ready', items: [] });
});

test('eligible public records are retained and the request bypasses stale caches', async () => {
  const records = [{ coach_id: 'synthetic-coach' }];
  const result = await read(async (url, options) => {
    assert.equal(url, 'https://fixture.invalid/rest/v1/rpc/get_public_coach_directory');
    assert.equal(options.method, 'POST');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.body, '{}');
    return Response.json(records);
  });
  assert.deepEqual(result, { status: 'ready', items: records });
});
