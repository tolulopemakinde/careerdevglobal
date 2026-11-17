export type WeeklyAvailability = { day_of_week: number; start_time: string; end_time: string; timezone?: string | null };
export type Reservation = { start_at: string; end_at: string };
export type RequestSlot = { start: Date; finish: Date; tz: string; label: string };

export function validTimezone(value: unknown): value is string {
  if (typeof value !== 'string' || !value) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
}

export function dateInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (key: string) => parts.find(p => p.type === key)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function wallClock(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const get = (key: string) => Number(parts.find(p => p.type === key)!.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
}

// Probe both offsets around a DST transition. Nonexistent wall times have no
// matching instant; repeated wall times produce two distinct UTC instants.
export function wallTimeInstants(date: string, minutes: number, timezone: string): Date[] {
  if (!validTimezone(timezone) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(minutes) || minutes < 0 || minutes >= 1440) return [];
  const day = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== date) return [];
  const target = day + minutes * 60000;
  const offsets = new Set<number>();
  for (let h = -36; h <= 36; h += 6) {
    const probe = target + h * 3600000;
    offsets.add(wallClock(new Date(probe), timezone) - probe);
  }
  return [...offsets].map(offset => new Date(target - offset))
    .filter(instant => wallClock(instant, timezone) === target).sort((a, b) => +a - +b);
}

export function formatSlot(start: Date, finish: Date, timezone: string): string {
  const format = new Intl.DateTimeFormat(undefined, { timeZone: timezone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'shortOffset' });
  return `${format.format(start)} – ${format.format(finish)} (${timezone})`;
}

export function formatBookingTime(value: string, timezone: string): string {
  const date = new Date(value);
  if (!Number.isFinite(+date) || !validTimezone(timezone)) return 'Session time unavailable';
  return `${new Intl.DateTimeFormat(undefined, { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' }).format(date)} (${timezone})`;
}

export function safeCalendlyUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || (url.hostname !== 'calendly.com' && !url.hostname.endsWith('.calendly.com')) || url.username || url.password || url.hash || url.pathname === '/') return null;
    return url.href;
  } catch { return null; }
}

export function safeMeetingUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
}

/** Published weekly hours are request suggestions, not verified Calendly slots. */
export function buildRequestSlots(input: {
  date: string; clientTimezone: string; coachTimezone: string;
  durationMinutes: number; availability: WeeklyAvailability[];
  reservations: Reservation[]; now: Date;
}): RequestSlot[] {
  const { date, clientTimezone, coachTimezone, durationMinutes, availability, reservations, now } = input;
  if (!validTimezone(clientTimezone) || !validTimezone(coachTimezone) || !Number.isInteger(durationMinutes) || durationMinutes <= 0 || durationMinutes > 480) return [];
  const day = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== date) return [];
  const result = new Map<number, RequestSlot>();
  // Adjacent coach dates may fall on the client's selected calendar date.
  for (let delta = -2; delta <= 2; delta += 1) {
    const coachDay = new Date(day + delta * 86400000);
    const coachDate = coachDay.toISOString().slice(0, 10);
    for (const hours of availability) {
      if (hours.day_of_week !== coachDay.getUTCDay()) continue;
      const tz = hours.timezone || coachTimezone;
      if (!validTimezone(tz)) continue;
      const parse = (value: string) => /^\d{2}:\d{2}(:\d{2})?$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5)) : NaN;
      const from = parse(hours.start_time), until = parse(hours.end_time);
      if (!Number.isFinite(from) || !Number.isFinite(until) || from < 0 || until > 1440 || from >= until || Number(hours.start_time.slice(3, 5)) > 59 || Number(hours.end_time.slice(3, 5)) > 59) continue;
      const boundaries = wallTimeInstants(coachDate, until === 1440 ? 1439 : until, tz);
      const end = boundaries.length ? Math.max(...boundaries.map(Number)) + (until === 1440 ? 60000 : 0) : null;
      if (end === null) continue;
      for (let minutes = from; minutes + durationMinutes <= until; minutes += durationMinutes) {
        for (const start of wallTimeInstants(coachDate, minutes, tz)) {
          const finish = new Date(+start + durationMinutes * 60000);
          if (+start <= +now || +finish > end || dateInTimezone(start, clientTimezone) !== date) continue;
          if (reservations.some(b => +start < Date.parse(b.end_at) && +finish > Date.parse(b.start_at))) continue;
          result.set(+start, { start, finish, tz: clientTimezone, label: formatSlot(start, finish, clientTimezone) });
        }
      }
    }
  }
  return [...result.values()].sort((a, b) => +a.start - +b.start);
}

/** A synchronous lock, acquired before the first await; server idempotency is still required. */
export function createSubmissionGate() {
  let busy = false;
  return {
    async run<T>(operation: () => Promise<T>): Promise<T | undefined> {
      if (busy) return undefined;
      busy = true;
      try { return await operation(); } finally { busy = false; }
    },
  };
}

export async function calendlyFailureMessage(error: unknown, data?: { error?: string; reconciliation_required?: boolean }): Promise<string> {
  let payload = data;
  const context = (error as { context?: Response } | null)?.context;
  if (context && typeof context.clone === 'function') {
    try { payload = await context.clone().json(); } catch { /* A transport failure may have no JSON response. */ }
  }
  if (payload?.reconciliation_required) return 'Calendly may have created an appointment. Do not confirm again. Contact support to reconcile this booking.';
  if (/not connected|connection unavailable|authorization expired|reconnect/i.test(payload?.error || '')) return 'Calendly is disconnected or authorization expired. Reconnect Calendly in the Calendly panel before continuing.';
  if (/not linked|map the service/i.test(payload?.error || '')) return 'This service has no Calendly event type. Map it in the Calendly panel before confirming.';
  if (/unavailable|no longer available|already.*booked/i.test(payload?.error || '')) return 'The requested time is unavailable. Ask the client to choose another time.';
  return 'The Calendly result could not be verified. Do not repeat this action until the appointment has been checked.';
}

type ActionResponse = { data: any; error: unknown };
export type BookingActionResult = { status: 'confirmed' | 'cancelled' | 'blocked' | 'review'; message: string };

/** Stop at either failed boundary. Never silently confirm without Calendly. */
export async function runCalendlyAction(
  action: 'confirm' | 'cancel',
  external: () => Promise<ActionResponse>,
  local: () => Promise<ActionResponse>,
): Promise<BookingActionResult> {
  try {
    const result = await external();
    if (result.error || result.data?.error || result.data?.ok !== true) {
      const message = await calendlyFailureMessage(result.error, result.data);
      const blocked = /Reconnect Calendly|Map it in/.test(message);
      return { status: blocked ? 'blocked' : 'review', message };
    }
    const saved = await local();
    if (saved.error || saved.data !== true) return { status: 'review', message: `Calendly accepted the action, but CareerDev could not verify ${action === 'confirm' ? 'confirmation' : 'cancellation'}. Do not repeat it. Contact support to reconcile this booking.` };
    return action === 'confirm' ? { status: 'confirmed', message: 'Booking confirmed.' } : { status: 'cancelled', message: 'Session cancelled.' };
  } catch {
    return { status: 'review', message: 'The booking result is uncertain. Do not repeat this action. Contact support to check Calendly and CareerDev.' };
  }
}
