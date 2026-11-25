const DEFAULT_TIME_ZONE = 'UTC';

function safeTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || !timeZone.trim()) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat('en', { timeZone }).format(0);
    return timeZone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/** Format an ISO instant as a readable date and time in an IANA timezone. */
export function formatDateTimeInTimeZone(instant, timeZone, locale = 'en-GB') {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: safeTimeZone(timeZone),
  }).format(date);
}

/** Format a booking in the viewer's timezone and in the schedule timezone. */
export function formatDualTimeZoneRange(start, end, viewerTimeZone, scheduleTimeZone, locale = 'en-GB') {
  const endDate = new Date(end);
  if (Number.isNaN(endDate.getTime())) return 'Time unavailable';
  const viewerRange = `${formatDateTimeInTimeZone(start, viewerTimeZone, locale)}–${new Intl.DateTimeFormat(locale, {
    timeStyle: 'short',
    timeZone: safeTimeZone(viewerTimeZone),
  }).format(endDate)}`;
  const scheduleRange = `${formatDateTimeInTimeZone(start, scheduleTimeZone, locale)}–${new Intl.DateTimeFormat(locale, {
    timeStyle: 'short',
    timeZone: safeTimeZone(scheduleTimeZone),
  }).format(endDate)}`;
  return `${viewerRange} (your time) · ${scheduleRange} (coach time${scheduleTimeZone ? `, ${scheduleTimeZone}` : ''})`;
}

/** Return today's calendar date in the supplied timezone for date input limits. */
export function dateInTimeZone(instant, timeZone, locale = 'en-CA') {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone: safeTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (name) => parts.find((item) => item.type === name)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
