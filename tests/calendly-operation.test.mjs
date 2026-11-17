import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCalendlyTransport,
  reconcileCalendlyOperation,
  rescheduleCalendlyBooking,
  runCalendlyOperation,
} from '../supabase/functions/_shared/calendly-operation.mjs';

const root = 'https://api.calendly.com';
const eventUri = root + '/scheduled_events/event-1';
const inviteeUri = eventUri + '/invitees/invitee-1';
const snapshot = {
  starts_at: '2035-01-01T10:00:00Z',
  ends_at: '2035-01-01T10:30:00Z',
  provider_user_uri: root + '/users/coach',
  provider_type_uri: root + '/event_types/type-1',
};
const bookingId = 'booking';
const actorId = 'coach-profile';

function fixture({ kind = 'confirm', editType, editInvitee, editSlot, fail } = {}) {
  let operation;
  let posts = 0;
  let reads = 0;
  let canceled = false;
  let tracking;
  let failing = fail;
  const data = kind === 'confirm' ? snapshot : {
    ...snapshot, provider_event_uri: eventUri, provider_invitee_uri: inviteeUri,
  };
  const store = {
    async begin(id, actor, requestedKind, verified) {
      assert.equal(id, bookingId);
      assert.equal(requestedKind, kind);
      if (actor !== actorId) throw new Error('Unauthorized');
      if (operation) return { ...operation, dispatch: false };
      if (!verified) return null;
      operation = { ...data, id: 'claim', state: 'external_pending', kind };
      return { ...operation, dispatch: true };
    },
    async context() { return { snapshot: data, client: { email: 'client@example.test', timezone: 'UTC' } }; },
    async record(claim, event, invitee) {
      assert.deepEqual([claim, event, invitee], ['claim', eventUri, inviteeUri]);
      operation.provider_event_uri = event;
      operation.provider_invitee_uri = invitee;
    },
    async finish(id, claim, event, invitee) {
      assert.deepEqual([id, claim, event, invitee], [bookingId, 'claim', eventUri, inviteeUri]);
      if (failing === 'persist') throw new Error('Write failed');
      operation.state = 'succeeded';
    },
    async flag() { operation.state = 'reconciliation_required'; },
  };
  const provider = async (path, body) => {
    if (body) {
      posts++;
      tracking = body.tracking;
      if (kind === 'cancel') canceled = true;
      if (failing === 'timeout') throw new Error('Lost response');
      if (failing === 'malformed') return {};
      return { resource: { event: eventUri, uri: inviteeUri } };
    }
    reads++;
    if (path === '/event_types/type-1') {
      const type = {
        uri: snapshot.provider_type_uri, active: true, kind: 'solo',
        profile: { owner: snapshot.provider_user_uri, type: 'User' },
        duration: 30, is_paid: false, booking_method: 'instant', locations: [{ kind: 'zoom' }],
      };
      return { resource: editType?.(type) ?? type };
    }
    if (path.startsWith('/event_type_available_times?')) {
      const slot = { status: 'available', start_time: snapshot.starts_at };
      return { collection: [editSlot?.(slot) ?? slot] };
    }
    const status = canceled ? 'canceled' : 'active';
    if (path === '/scheduled_events/event-1') {
      return { resource: {
        uri: eventUri, status, event_type: snapshot.provider_type_uri,
        start_time: snapshot.starts_at, end_time: snapshot.ends_at,
        event_memberships: [{ user: snapshot.provider_user_uri }],
      } };
    }
    assert.equal(path, '/scheduled_events/event-1/invitees/invitee-1');
    const invitee = { uri: inviteeUri, event: eventUri, status, tracking };
    return { resource: editInvitee?.(invitee) ?? invitee };
  };
  const input = { bookingId, actorId, kind, store, provider, now: Date.parse('2034-12-01T00:00Z') };
  return {
    run: overrides => runCalendlyOperation({ ...input, ...overrides }),
    reconcile: overrides => reconcileCalendlyOperation({ ...input, eventUri, inviteeUri, ...overrides }),
    recover: () => { failing = undefined; },
    counts: () => ({ reads, posts }),
  };
}

test('rejects unauthorized actors before any provider access', async () => {
  const f = fixture();
  await assert.rejects(f.run({ actorId: 'other-profile' }), /Unauthorized/);
  await assert.rejects(f.run({ actorId: null }), /Unauthorized/);
  assert.deepEqual(f.counts(), { reads: 0, posts: 0 });
});

test('concurrent confirmations dispatch once and replay the persisted result', async () => {
  const f = fixture();
  await Promise.all(Array.from({ length: 12 }, () => f.run()));
  assert.equal((await f.run()).state, 'succeeded');
  assert.equal(f.counts().posts, 1);
});

for (const [label, options] of [
  ['unowned type', { editType: type => ({ ...type, profile: { type: 'User', owner: root + '/users/other' } }) }],
  ['mismatched type', { editType: type => ({ ...type, uri: root + '/event_types/other' }) }],
  ['wrong duration', { editType: type => ({ ...type, duration: 15 }) }],
  ['provider-side payment', { editType: type => ({ ...type, is_paid: true }) }],
  ['unavailable start', { editSlot: slot => ({ ...slot, status: 'unavailable' }) }],
]) {
  test('confirmation rejects ' + label + ' before dispatch', async () => {
    const f = fixture(options);
    await assert.rejects(f.run(), /Unsupported|unavailable/);
    assert.equal(f.counts().posts, 0);
  });
}

for (const failure of ['timeout', 'malformed', 'persist']) {
  test('confirmation ' + failure + ' requires GET-only reconciliation and never repeats creation', async () => {
    const f = fixture({ fail: failure });
    assert.equal((await f.run()).state, 'reconciliation_required');
    assert.equal((await f.run()).state, 'reconciliation_required');
    f.recover();
    assert.equal((await f.reconcile()).state, 'succeeded');
    assert.equal(f.counts().posts, 1);
  });
}

test('unrelated invitee and rescheduled invitee evidence cannot confirm the original claim', async () => {
  for (const editInvitee of [
    invitee => ({ ...invitee, tracking: { utm_content: 'another-claim' } }),
    invitee => ({ ...invitee, rescheduled: true, new_invitee: 'new' }),
  ]) {
    const f = fixture({ editInvitee });
    assert.equal((await f.run()).state, 'reconciliation_required');
    await assert.rejects(f.reconcile(), /evidence/);
    assert.equal(f.counts().posts, 1);
  }
});

test('uncertain cancellation converges only after provider evidence and dispatches once', async () => {
  const f = fixture({ kind: 'cancel', fail: 'timeout' });
  assert.equal((await f.run()).state, 'reconciliation_required');
  await assert.rejects(f.reconcile({ inviteeUri: root + '/scheduled_events/other/invitees/invitee-1' }));
  assert.equal((await f.reconcile()).state, 'succeeded');
  assert.equal((await f.run()).state, 'succeeded');
  assert.equal(f.counts().posts, 1);
});

test('transport rejects redirects and surfaces provider errors without repeating POST', async () => {
  let calls = 0;
  const send = createCalendlyTransport('synthetic', async (url, options) => {
    calls++;
    assert.equal(url, root + '/invitees');
    assert.equal(options.redirect, 'error');
    assert.equal(options.method, 'POST');
    assert.ok(options.signal instanceof AbortSignal);
    return new Response(null, { status: 503 });
  });
  await assert.rejects(send('/invitees', {}), /Calendly request failed/);
  assert.equal(calls, 1);
});

test('a persisted receipt supports read-only recovery without supplying provider IDs', async () => {
  const f = fixture({ fail: 'persist' });
  assert.equal((await f.run()).state, 'reconciliation_required');
  f.recover();
  assert.equal((await f.reconcile({ eventUri: undefined, inviteeUri: undefined })).state, 'succeeded');
  assert.equal(f.counts().posts, 1);
});

function rescheduleFixture({ active = false, replacement = {}, hostedUrl = 'https://calendly.com/reschedulings/fixture' } = {}) {
  const nextEventUri = root + '/scheduled_events/event-2';
  const nextInviteeUri = nextEventUri + '/invitees/invitee-2';
  const nextStart = '2035-01-01T11:00:00Z';
  const nextEnd = '2035-01-01T11:30:00Z';
  const original = { ...snapshot, provider_event_uri: eventUri, provider_invitee_uri: inviteeUri };
  const providerReads = [];
  const moves = [];
  const member = { user: snapshot.provider_user_uri };
  const resources = {
    [eventUri]: {
      uri: eventUri, status: active ? 'active' : 'canceled', event_type: snapshot.provider_type_uri,
      start_time: snapshot.starts_at, end_time: snapshot.ends_at, event_memberships: [member],
    },
    [inviteeUri]: {
      uri: inviteeUri, event: eventUri, status: active ? 'active' : 'canceled',
      rescheduled: !active, new_invitee: active ? null : nextInviteeUri,
      reschedule_url: hostedUrl,
    },
    [nextEventUri]: {
      uri: nextEventUri, status: 'active', event_type: snapshot.provider_type_uri,
      start_time: nextStart, end_time: nextEnd, event_memberships: [member], ...replacement.event,
    },
    [nextInviteeUri]: {
      uri: nextInviteeUri, event: nextEventUri, status: 'active',
      old_invitee: inviteeUri, ...replacement.invitee,
    },
  };
  const provider = async (path, body) => {
    assert.equal(body, undefined, 'rescheduling never sends a Calendly mutation');
    providerReads.push(path);
    return { resource: resources[root + path] };
  };
  const store = {
    async rescheduleContext(id, actor) {
      assert.equal(id, bookingId);
      if (actor !== actorId) throw new Error('Unauthorized');
      return original;
    },
    async applyReschedule(id, actor, evidence) {
      assert.deepEqual([id, actor], [bookingId, actorId]);
      moves.push(evidence);
    },
  };
  return {
    run: (actor = actorId) => rescheduleCalendlyBooking({
      bookingId, actorId: actor, store, provider, now: Date.parse('2034-12-01T00:00Z'),
    }),
    providerReads, moves,
    expected: {
      ...original, replacement_event_uri: nextEventUri, replacement_invitee_uri: nextInviteeUri,
      replacement_start: nextStart, replacement_end: nextEnd,
    },
  };
}

test('reschedule rejects an unrelated actor before any provider reads', async () => {
  const fixture = rescheduleFixture({ active: true });
  await assert.rejects(fixture.run('outsider'), /Unauthorized/);
  assert.equal(fixture.providerReads.length, 0);
});

test('an active booking yields the hosted reschedule link without moving the slot', async () => {
  const fixture = rescheduleFixture({ active: true });
  assert.deepEqual(await fixture.run(), {
    state: 'active', url: 'https://calendly.com/reschedulings/fixture',
  });
  assert.equal(fixture.moves.length, 0);
});

test('reschedule never returns a link outside Calendly', async () => {
  const fixture = rescheduleFixture({ active: true, hostedUrl: 'https://calendly.com.example.invalid/reschedulings/fixture' });
  await assert.rejects(fixture.run(), /rescheduling is unavailable/);
  assert.equal(fixture.moves.length, 0);
});

test('a linked replacement moves the booking once per verified database update', async () => {
  const fixture = rescheduleFixture();
  assert.deepEqual(await fixture.run(), { state: 'rescheduled' });
  assert.deepEqual(fixture.moves, [fixture.expected]);
  assert.equal(fixture.providerReads.length, 4);
});

for (const replacement of [
  { invitee: { old_invitee: root + '/scheduled_events/other/invitees/other' } },
  { invitee: { status: 'canceled' } },
  { event: { event_memberships: [{ user: root + '/users/other' }] } },
  { event: { end_time: '2035-01-01T12:00:00Z' } },
]) {
  test('reschedule refuses replacement evidence that changes the linkage, state, coach or duration', async () => {
    const fixture = rescheduleFixture({ replacement });
    await assert.rejects(fixture.run(), /does not match the booking/);
    assert.equal(fixture.moves.length, 0);
  });
}
