import test from 'node:test';
import assert from 'node:assert/strict';
import { dateInTimeZone, formatDateTimeInTimeZone, formatDualTimeZoneRange } from '../lib/marketplace/booking-time.mjs';

test('formats the same instant in the viewer and coach timezones', () => {
  const label = formatDualTimeZoneRange(
    '2026-01-05T15:00:00.000Z',
    '2026-01-05T16:00:00.000Z',
    'America/Los_Angeles',
    'Africa/Lagos',
  );

  assert.match(label, /5 Jan 2026, 07:00–08:00 \(your time\)/);
  assert.match(label, /5 Jan 2026, 16:00–17:00 \(coach time, Africa\/Lagos\)/);
});

test('preserves calendar-day changes across timezones', () => {
  assert.equal(
    formatDateTimeInTimeZone('2026-01-05T02:30:00.000Z', 'America/Los_Angeles'),
    '4 Jan 2026, 18:30',
  );
});

test('uses the schedule timezone when setting the earliest selectable date', () => {
  assert.equal(dateInTimeZone('2026-01-05T02:30:00.000Z', 'America/Los_Angeles'), '2026-01-04');
  assert.equal(dateInTimeZone('2026-01-05T02:30:00.000Z', 'Africa/Lagos'), '2026-01-05');
});

test('invalid timezone data falls back to UTC instead of breaking the booking panel', () => {
  assert.equal(formatDateTimeInTimeZone('2026-01-05T15:00:00.000Z', 'Not/A-Timezone'), '5 Jan 2026, 15:00');
  assert.equal(formatDualTimeZoneRange('2026-01-05T15:00:00.000Z', 'invalid', 'UTC', 'Africa/Lagos'), 'Time unavailable');
});
