import assert from 'node:assert/strict';
import test from 'node:test';
import { createRescheduleHandler } from '../supabase/functions/careerdev-calendly-reschedule/handler.mjs';

const origin = 'https://preview.example.test';
const bookingId = '00000000-0000-0000-0000-000000000051';
const owner = 'client-profile';
const providerOrigin = 'https://api.calendly.com';
const providerUser = providerOrigin + '/users/coach';
const eventType = providerOrigin + '/event_types/type';
const oldEvent = providerOrigin + '/scheduled_events/old';
const newEvent = providerOrigin + '/scheduled_events/new';
const oldInvitee = oldEvent + '/invitees/old';
const newInvitee = newEvent + '/invitees/new';
const encryptionKey = 'synthetic-reschedule-key';
const providerToken = 'synthetic-calendly-token';
const hostedUrl = 'https://calendly.com/reschedulings/fixture';
const oldStart = '2090-01-01T10:00:00Z';
const oldEnd = '2090-01-01T10:30:00Z';
const newStart = '2090-01-01T11:00:00Z';
const newEnd = '2090-01-01T11:30:00Z';

async function encryptedToken() {
  const encoder = new TextEncoder();
  const raw = await crypto.subtle.digest('SHA-256', encoder.encode(encryptionKey));
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(providerToken));
  return Buffer.from(iv).toString('base64url') + '.' + Buffer.from(payload).toString('base64url');
}

async function fixture({ moved = false, expired = false, overlap = false } = {}) {
  const dbCalls = [];
  const providerReads = [];
  const encrypted = await encryptedToken();
  const snapshot = {
    provider_event_uri: oldEvent, provider_invitee_uri: oldInvitee,
    provider_user_uri: providerUser, provider_type_uri: eventType, starts_at: oldStart, ends_at: oldEnd,
  };
  const event = (uri, status, start_time, end_time) => ({
    uri, status, start_time, end_time, event_type: eventType, event_memberships: [{ user: providerUser }],
  });
  const resources = {
    [oldEvent]: event(oldEvent, moved ? 'canceled' : 'active', oldStart, oldEnd),
    [oldInvitee]: {
      uri: oldInvitee, event: oldEvent, status: moved ? 'canceled' : 'active',
      rescheduled: moved, new_invitee: moved ? newInvitee : null, reschedule_url: hostedUrl,
    },
    [newEvent]: event(newEvent, 'active', newStart, newEnd),
    [newInvitee]: { uri: newInvitee, event: newEvent, status: 'active', old_invitee: oldInvitee },
  };
  const db = {
    auth: {
      async getUser(token) {
        dbCalls.push(['auth', token]);
        const user = { owner: { id: owner }, outsider: { id: 'different-client' },
          anonymous: { id: owner, is_anonymous: true } }[token] ?? null;
        return { data: { user }, error: user ? null : new Error('invalid session') };
      },
    },
    async rpc(name, args) {
      dbCalls.push([name, args]);
      assert.equal(args.p_booking_id, bookingId);
      if (name === 'get_calendly_reschedule_context') {
        return args.p_actor_id === owner ? { data: snapshot } : { error: { code: '42501' } };
      }
      assert.equal(name, 'apply_calendly_reschedule');
      assert.equal(args.p_actor_id, owner);
      return overlap ? { error: { code: '23P01' } } : { data: null };
    },
    from(table) {
      const filters = {};
      const query = {
        select() { return query; },
        eq(name, value) { filters[name] = value; return query; },
        async single() {
          dbCalls.push([table, filters]);
          if (table === 'marketplace_booking_requests') return { data: { coach_id: 'coach' } };
          assert.equal(table, 'calendly_connections');
          assert.deepEqual(filters, { coach_id: 'coach', calendly_user_uri: providerUser, active: true });
          return { data: {
            access_token_ciphertext: encrypted,
            token_expires_at: expired ? '2000-01-01T00:00:00Z' : '2090-01-01T00:00:00Z',
          } };
        },
      };
      return query;
    },
  };
  const handler = createRescheduleHandler({
    db, allowedOrigin: origin, encryptionKey,
    async send(url, options) {
      providerReads.push(url);
      assert.equal(options.method, 'GET');
      assert.equal(options.headers.Authorization, 'Bearer ' + providerToken);
      assert.ok(resources[url]);
      return Response.json({ resource: resources[url] });
    },
  });
  function request({ token = 'owner', requestOrigin = origin, body = { booking_id: bookingId } } = {}) {
    return handler(new Request('https://edge.example.test/reschedule', {
      method: 'POST',
      headers: { Origin: requestOrigin, Authorization: 'Bearer ' + token },
      body: JSON.stringify(body),
    }));
  }
  return { request, dbCalls, providerReads };
}

test('wrong origin, invalid session, and anonymous identity stop before provider access', async () => {
  const f = await fixture();
  assert.equal((await f.request({ requestOrigin: 'https://other.example.test' })).status, 404);
  assert.deepEqual(f.dbCalls, []);
  assert.equal((await f.request({ token: 'invalid' })).status, 401);
  assert.equal((await f.request({ token: 'anonymous' })).status, 401);
  assert.deepEqual(f.dbCalls, [['auth', 'invalid'], ['auth', 'anonymous']]);
  assert.deepEqual(f.providerReads, []);
});

test('an unrelated client cannot submit the booking owner as their actor', async () => {
  const f = await fixture();
  const response = await f.request({ token: 'outsider', body: { booking_id: bookingId, actor_id: owner } });
  assert.equal(response.status, 404);
  assert.deepEqual(f.dbCalls, [
    ['auth', 'outsider'],
    ['get_calendly_reschedule_context', { p_booking_id: bookingId, p_actor_id: 'different-client' }],
  ]);
  assert.deepEqual(f.providerReads, []);
});

test('the owner receives only the private hosted link with caching disabled', async () => {
  const f = await fixture();
  const response = await f.request();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), { state: 'active', url: hostedUrl });
  assert.deepEqual(f.providerReads, [oldEvent, oldInvitee]);
  assert.equal(f.dbCalls.some(([name]) => name === 'apply_calendly_reschedule'), false);
});

test('an expired coach connection stops before provider access', async () => {
  const f = await fixture({ expired: true });
  assert.equal((await f.request()).status, 409);
  assert.deepEqual(f.providerReads, []);
});

test('the handler reports a move only after the slot update succeeds', async () => {
  for (const overlap of [false, true]) {
    const f = await fixture({ moved: true, overlap });
    const response = await f.request();
    assert.equal(response.status, overlap ? 409 : 200);
    const result = await response.json();
    if (overlap) assert.match(result.error, /could not verify/);
    else assert.deepEqual(result, { state: 'rescheduled' });
    assert.deepEqual(f.providerReads, [oldEvent, oldInvitee, newEvent, newInvitee]);
    const [name, args] = f.dbCalls.at(-1);
    assert.equal(name, 'apply_calendly_reschedule');
    assert.equal(args.p_evidence.replacement_invitee_uri, newInvitee);
    assert.equal(args.p_evidence.replacement_start, newStart);
  }
});
