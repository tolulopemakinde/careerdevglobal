import { runAcceptanceAdapterChecks } from './calendly-acceptance-adapter.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createRescheduleHandler } from '../supabase/functions/careerdev-calendly-reschedule/handler.mjs';

const url = 'http://127.0.0.1:54321';
assert.equal(process.env.API_URL, url, 'Run this test only against the local fixture');
assert.ok(process.env.SERVICE_ROLE_KEY && process.env.ANON_KEY, 'Local Supabase keys are required');

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, process.env.SERVICE_ROLE_KEY, options);
const bookingId = '00000000-0000-0000-0000-000000000051';
const coachProfileId = '00000000-0000-0000-0000-000000000001';
const clientId = '00000000-0000-0000-0000-000000000021';
const providerOrigin = 'https://api.calendly.com';
const host = providerOrigin + '/users/coach';
const eventType = providerOrigin + '/event_types/type-1';
const event = providerOrigin + '/scheduled_events/initial';
const invitee = event + '/invitees/initial';
const nextEvent = providerOrigin + '/scheduled_events/replacement';
const nextInvitee = nextEvent + '/invitees/replacement';
const originalTime = ['2090-01-01T10:00:00Z', '2090-01-01T10:30:00Z'];
const nextTime = ['2090-01-01T11:00:00Z', '2090-01-01T11:30:00Z'];
const hostedUrl = 'https://calendly.com/reschedulings/fixture';
const previewOrigin = 'http://localhost:3000';

async function check(operation, description) {
  const { data, error } = await operation;
  if (error) throw new Error(description + ': ' + error.message);
  return data;
}

async function signIn(label) {
  const email = label + '@example.test';
  const password = randomUUID();
  await check(admin.auth.admin.createUser({ email, password, email_confirm: true }), 'Create synthetic account');
  const client = createClient(url, process.env.ANON_KEY, options);
  const { user, session } = await check(client.auth.signInWithPassword({ email, password }), 'Sign in');
  return { client, id: user.id, token: session.access_token };
}

const owner = await signIn('client-owner');
const other = await signIn('unrelated-client');
await check(admin.from('profiles').insert({ id: owner.id }), 'Create owner profile');
await check(admin.from('clients').update({ profile_id: owner.id }).eq('id', clientId), 'Link owner to booking');

const claim = await check(admin.rpc('begin_calendly_operation', {
  p_booking_id: bookingId, p_actor_id: coachProfileId, p_kind: 'confirm',
  p_snapshot: {
    provider_user_uri: host, provider_type_uri: eventType,
    starts_at: originalTime[0], ends_at: originalTime[1],
  },
}), 'Claim synthetic booking');
assert.equal(claim.dispatch, true);
await check(admin.rpc('finish_calendly_operation', {
  p_booking_id: bookingId, p_operation_id: claim.id, p_event_uri: event, p_invitee_uri: invitee,
}), 'Confirm synthetic booking');
const transaction = await check(owner.client.rpc('create_marketplace_transaction', { p_booking_id: bookingId }),
  'Initialize synthetic marketplace transaction');
assert.ok(transaction);

const encryptionKey = randomUUID();
const encoder = new TextEncoder();
const digest = await crypto.subtle.digest('SHA-256', encoder.encode(encryptionKey));
const key = await crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt']);
const iv = crypto.getRandomValues(new Uint8Array(12));
const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode('synthetic-token'));
await check(admin.from('calendly_connections').update({
  access_token_ciphertext: Buffer.from(iv).toString('base64url') + '.' + Buffer.from(ciphertext).toString('base64url'),
  token_expires_at: '2090-01-01T00:00:00Z',
}).eq('calendly_user_uri', host), 'Set synthetic Calendly connection');

let moved = false;
const providerReads = [];
function eventResponse(uri, status, [start_time, end_time]) {
  return { uri, status, start_time, end_time, event_type: eventType, event_memberships: [{ user: host }] };
}
const handler = createRescheduleHandler({
  db: admin, allowedOrigin: previewOrigin, encryptionKey,
  async send(uri, options) {
    assert.equal(options.method, 'GET');
    assert.equal(options.headers.Authorization, 'Bearer synthetic-token');
    providerReads.push(uri);
    const status = moved ? 'canceled' : 'active';
    const resources = {
      [event]: eventResponse(event, status, originalTime),
      [invitee]: { uri: invitee, event, status, rescheduled: moved,
        reschedule_url: hostedUrl, new_invitee: moved ? nextInvitee : null },
      [nextEvent]: eventResponse(nextEvent, 'active', nextTime),
      [nextInvitee]: { uri: nextInvitee, event: nextEvent, status: 'active', old_invitee: invitee },
    };
    assert.ok(resources[uri], 'Unexpected Calendly request');
    return Response.json({ resource: resources[uri] });
  },
});
function invoke(token) {
  return handler(new Request(url + '/functions/v1/careerdev-calendly-reschedule', {
    method: 'POST',
    headers: { Origin: previewOrigin, Authorization: 'Bearer ' + token },
    body: JSON.stringify({ booking_id: bookingId }),
  }));
}

assert.equal((await invoke('invalid-token')).status, 401);
assert.equal((await invoke(other.token)).status, 404);
assert.deepEqual(providerReads, []);
const link = await invoke(owner.token);
assert.equal(link.status, 200);
assert.deepEqual(await link.json(), { state: 'active', url: hostedUrl });
moved = true;
const result = await invoke(owner.token);
assert.equal(result.status, 200);
assert.deepEqual(await result.json(), { state: 'rescheduled' });
assert.deepEqual(providerReads, [event, invitee, event, invitee, nextEvent, nextInvitee]);

const slot = await check(admin.from('marketplace_booking_slots').select('start_at,end_at,status')
  .eq('booking_id', bookingId).single(), 'Read moved slot');
assert.equal(slot.status, 'booked');
assert.deepEqual([Date.parse(slot.start_at), Date.parse(slot.end_at)], nextTime.map(Date.parse));
assert.equal(await check(owner.client.rpc('create_marketplace_transaction', { p_booking_id: bookingId }),
  'Read existing transaction after reschedule'), transaction);
console.log('Local Supabase Auth, booking ownership, reschedule and transaction checks passed.');

await runAcceptanceAdapterChecks({admin,owner,signIn,check});
