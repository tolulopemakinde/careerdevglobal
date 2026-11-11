import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRequestSlots, wallTimeInstants, dateInTimezone, formatBookingTime, validTimezone, safeCalendlyUrl, safeMeetingUrl, createSubmissionGate, calendlyFailureMessage, runCalendlyAction } from '../lib/scheduling.ts';

const weekly = (day, start, end, timezone = 'Africa/Lagos') => ({ day_of_week: day, start_time: start, end_time: end, timezone });
const input = { date: '2026-11-09', clientTimezone: 'America/New_York', coachTimezone: 'Africa/Lagos', durationMinutes: 60, availability: [weekly(1, '09:00', '12:00')], reservations: [], now: new Date('2026-11-04T12:00:00Z') };
const iso = xs => xs.map(x => x.toISOString());

test('Lagos hours preserve UTC instants and display in the client timezone', () => {
  const slots = buildRequestSlots(input);
  assert.deepEqual(iso(slots.map(x => x.start)), ['2026-11-09T08:00:00.000Z', '2026-11-09T09:00:00.000Z', '2026-11-09T10:00:00.000Z']);
  assert.ok(slots.every(x => x.tz === 'America/New_York' && x.label.includes('America/New_York')));
  assert.match(slots[0].label, /3:00/);
});
test('client calendar date includes the adjacent coach date across midnight', () => {
  const slots = buildRequestSlots({ ...input, clientTimezone: 'America/Los_Angeles', date: '2026-11-08', availability: [weekly(1, '00:00', '02:00', 'Asia/Tokyo')] });
  assert.equal(slots.length, 2);
  assert.equal(slots[0].start.toISOString(), '2026-11-08T15:00:00.000Z');
  assert.ok(slots.every(x => dateInTimezone(x.start, 'America/Los_Angeles') === '2026-11-08'));
});
test('spring DST gaps are omitted', () => {
  assert.deepEqual(wallTimeInstants('2027-03-14', 150, 'America/New_York'), []);
});
test('autumn repeated times retain both distinct instants', () => {
  assert.deepEqual(iso(wallTimeInstants('2026-11-01', 90, 'America/New_York')), ['2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z']);
  const slots = buildRequestSlots({ ...input, date: '2026-11-01', clientTimezone: 'America/New_York', now: new Date('2026-10-01Z'), durationMinutes: 30, availability: [weekly(0, '01:00', '02:00', 'America/New_York')] });
  assert.equal(slots.length, 4);
  assert.equal(new Set(slots.map(x => +x.start)).size, 4);
  assert.ok(slots.some(x => x.label.includes('GMT-4')) && slots.some(x => x.label.includes('GMT-5')));
});
test('fractional timezone offsets are respected', () => {
  assert.deepEqual(iso(wallTimeInstants('2026-11-09', 540, 'Asia/Kathmandu')), ['2026-11-09T03:15:00.000Z']);
});
test('past slots are omitted', () => {
  const slots = buildRequestSlots({ ...input, now: new Date('2026-11-09T09:00:00Z') });
  assert.equal(slots.length, 1);
  assert.equal(slots[0].start.toISOString(), '2026-11-09T10:00:00.000Z');
});
test('overlapping reservations are excluded and adjacent times remain', () => {
  const slots = buildRequestSlots({ ...input, reservations: [{ start_at: '2026-11-09T09:00:00Z', end_at: '2026-11-09T10:00:00Z' }] });
  assert.deepEqual(iso(slots.map(x => x.start)), ['2026-11-09T08:00:00.000Z', '2026-11-09T10:00:00.000Z']);
});
test('duplicate weekly intervals produce one suggestion per instant', () => {
  assert.equal(buildRequestSlots({ ...input, availability: [...input.availability, ...input.availability] }).length, 3);
});
for (const durationMinutes of [0, -1, NaN, 1.5, Infinity, 481]) test(`invalid duration ${durationMinutes} cannot loop or produce slots`, () => {
  assert.deepEqual(buildRequestSlots({ ...input, durationMinutes }), []);
});
test('invalid dates, hours and zones fail safely', () => {
  assert.deepEqual(buildRequestSlots({ ...input, date: '2026-02-30' }), []);
  assert.deepEqual(buildRequestSlots({ ...input, clientTimezone: 'invalid' }), []);
  assert.deepEqual(buildRequestSlots({ ...input, availability: [weekly(1, '09:99', '12:00')] }), []);
  assert.equal(validTimezone(''), false);
  assert.equal(formatBookingTime('invalid', 'UTC'), 'Session time unavailable');
});
test('date and displayed timezone describe the same instant', () => {
  assert.equal(dateInTimezone(new Date('2026-11-09T00:30:00Z'), 'America/Los_Angeles'), '2026-11-08');
  assert.match(formatBookingTime('2026-11-09T08:00:00Z', 'Africa/Lagos'), /Africa\/Lagos/);
});
test('fallback only accepts HTTPS Calendly event URLs', () => {
  assert.equal(safeCalendlyUrl('https://calendly.com/example/coaching'), 'https://calendly.com/example/coaching');
  for (const url of ['javascript:alert(1)', 'http://calendly.com/a', 'https://calendly.com.evil.test/a', 'https://evil.test/calendly.com/a', 'https://user:pass@calendly.com/a', 'https://calendly.com/', 'https://calendly.com/a#secret']) assert.equal(safeCalendlyUrl(url), null);
});
test('meeting links reject executable schemes and embedded credentials', () => {
  assert.equal(safeMeetingUrl('https://meeting.example.test/123'), 'https://meeting.example.test/123');
  assert.equal(safeMeetingUrl('javascript:alert(1)'), null);
  assert.equal(safeMeetingUrl('https://u:p@meeting.example.test/a'), null);
});
test('synchronous submission gate blocks double clicks before auth resolves', async () => {
  const gate = createSubmissionGate(); let calls = 0, resolve;
  const first = gate.run(() => { calls++; return new Promise(r => { resolve = r; }); });
  const second = await gate.run(async () => { calls++; });
  assert.equal(second, undefined); assert.equal(calls, 1); resolve('saved');
  assert.equal(await first, 'saved');
  await gate.run(async () => { calls++; }); assert.equal(calls, 2);
});
test('submission lock is released after a rejected operation', async () => {
  const gate = createSubmissionGate();
  await assert.rejects(gate.run(async () => { throw new Error('offline'); }));
  assert.equal(await gate.run(async () => 'recovered'), 'recovered');
});
test('Supabase non-2xx JSON body yields useful disconnected message', async () => {
  const error = { context: new Response(JSON.stringify({ error: 'Coach Calendly account is not connected' }), { status: 400 }) };
  assert.match(await calendlyFailureMessage(error), /Reconnect Calendly/);
});
test('non-JSON transport failures yield an uncertain outcome', async () => {
  assert.match(await calendlyFailureMessage({ context: new Response('bad gateway', { status: 502 }) }), /could not be verified/);
});
test('disconnected provider never falls through to local confirmation', async () => {
  let localCalls = 0;
  const result = await runCalendlyAction('confirm', async () => ({ data: { error: 'Coach Calendly account is not connected' }, error: null }), async () => { localCalls++; return { data: true, error: null }; });
  assert.equal(result.status, 'blocked'); assert.equal(localCalls, 0);
});
test('unmapped service never falls through to local confirmation', async () => {
  const result = await runCalendlyAction('confirm', async () => ({ data: { error: 'This service is not linked to a Calendly event type' }, error: null }), async () => { assert.fail('must not confirm'); });
  assert.equal(result.status, 'blocked');
});
test('authorization failures stop confirmation', async () => {
  const result = await runCalendlyAction('confirm', async () => ({ data: { error: 'Only the assigned coach can finalize this booking' }, error: new Error('403') }), async () => { assert.fail('must not confirm'); });
  assert.equal(result.status, 'review');
});
test('unavailable slot does not trigger local confirmation', async () => {
  const result = await runCalendlyAction('confirm', async () => ({ data: { error: 'This time is unavailable' }, error: null }), async () => { assert.fail('must not confirm'); });
  assert.equal(result.status, 'review'); assert.match(result.message, /another time/);
});
test('external creation followed by persistence failure requires reconciliation', async () => {
  const result = await runCalendlyAction('confirm', async () => ({ data: { reconciliation_required: true, error: 'could not save' }, error: null }), async () => { assert.fail('must not confirm'); });
  assert.equal(result.status, 'review'); assert.match(result.message, /may have created/);
});
test('local confirmation failure after provider success is never success', async () => {
  let externalCalls = 0;
  const result = await runCalendlyAction('confirm', async () => { externalCalls++; return { data: { ok: true }, error: null }; }, async () => ({ data: null, error: new Error('DB failed') }));
  assert.equal(result.status, 'review'); assert.equal(externalCalls, 1); assert.match(result.message, /Do not repeat/);
});
test('network timeout after sending an external action is not retried', async () => {
  let calls = 0;
  const result = await runCalendlyAction('confirm', async () => { calls++; throw new Error('timeout'); }, async () => { assert.fail('must not confirm'); });
  assert.equal(result.status, 'review'); assert.equal(calls, 1);
});
test('confirmation requires checked success at both boundaries', async () => {
  const order = [];
  const result = await runCalendlyAction('confirm', async () => { order.push('Calendly'); return { data: { ok: true }, error: null }; }, async () => { order.push('CareerDev'); return { data: true, error: null }; });
  assert.equal(result.status, 'confirmed'); assert.deepEqual(order, ['Calendly', 'CareerDev']);
});
test('missing external success response does not proceed', async () => {
  const result = await runCalendlyAction('confirm', async () => ({ data: {}, error: null }), async () => { assert.fail('must not confirm'); });
  assert.equal(result.status, 'review');
});
test('failed Calendly cancellation leaves the local operation untouched', async () => {
  const result = await runCalendlyAction('cancel', async () => ({ data: { error: 'Calendly cancellation failed' }, error: null }), async () => { assert.fail('must not cancel locally'); });
  assert.equal(result.status, 'review');
});
test('local cancellation failure after external success requires reconciliation', async () => {
  const result = await runCalendlyAction('cancel', async () => ({ data: { ok: true }, error: null }), async () => ({ data: false, error: null }));
  assert.equal(result.status, 'review'); assert.match(result.message, /cancellation/);
});
