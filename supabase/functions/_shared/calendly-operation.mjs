const origin = 'https://api.calendly.com';
const trackingSource = 'careerdev-marketplace';

function pathFor(uri, resource) {
  if (typeof uri !== 'string' ||
      !new RegExp('^https://api[.]calendly[.]com/' + resource + '/[A-Za-z0-9-]+$').test(uri)) {
    throw new Error('Invalid Calendly resource');
  }
  return uri.slice(origin.length);
}

function inviteePath(event, invitee) {
  const eventPath = pathFor(event, 'scheduled_events');
  const prefix = event + '/invitees/';
  if (typeof invitee !== 'string' || !invitee.startsWith(prefix) ||
      !/^[A-Za-z0-9-]+$/.test(invitee.slice(prefix.length))) {
    throw new Error('Invitee is outside the scheduled event');
  }
  return eventPath + invitee.slice(event.length);
}

function instant(value) {
  return typeof value === 'string' ? Date.parse(value) : NaN;
}

function ownedEvent(event, snapshot) {
  return instant(event?.start_time) === instant(snapshot.starts_at) &&
    instant(event?.end_time) === instant(snapshot.ends_at) &&
    event?.event_memberships?.length === 1 &&
    event.event_memberships[0].user === snapshot.provider_user_uri;
}

export function createCalendlyTransport(token, send = fetch) {
  return async (path, body) => {
    const response = await send(origin + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error('Calendly request failed');
    return response.status === 204 ? null : response.json();
  };
}

async function confirmationPayload(snapshot, client, provider, now) {
  const start = instant(snapshot.starts_at);
  const end = instant(snapshot.ends_at);
  const duration = (end - start) / 60_000;
  if (!(start > now + 1_000) || !Number.isInteger(duration) || duration <= 0 || !client?.email) {
    throw new Error('Invalid booking time or invitee');
  }
  const timezone = client.timezone || 'UTC';
  new Intl.DateTimeFormat('en', { timeZone: timezone }).format(start);
  pathFor(snapshot.provider_user_uri, 'users');
  const { resource: type } = await provider(pathFor(snapshot.provider_type_uri, 'event_types'));
  if (type?.uri !== snapshot.provider_type_uri || type.active !== true || type.kind !== 'solo' ||
      type.profile?.type !== 'User' || type.profile.owner !== snapshot.provider_user_uri ||
      type.duration !== duration || type.is_paid !== false || type.booking_method !== 'instant' ||
      type.custom_questions?.some(question => question.enabled && question.required)) {
    throw new Error('Unsupported or unauthorized Calendly event type');
  }
  // Limit the first integration to single-location events that do not need
  // any invitee-supplied location or telephone data.
  const location = type.locations?.[0];
  if (type.locations?.length !== 1 ||
      !['zoom', 'google_conference', 'microsoft_teams', 'custom', 'physical'].includes(location?.kind) ||
      (['physical', 'custom'].includes(location.kind) && !location.location)) {
    throw new Error('Unsupported Calendly location');
  }
  const params = new URLSearchParams({
    event_type: type.uri,
    start_time: new Date(start - 1_000).toISOString(),
    end_time: new Date(end + 1_000).toISOString(),
  });
  const { collection } = await provider('/event_type_available_times?' + params);
  if (!collection?.some(slot => slot.status === 'available' && instant(slot.start_time) === start)) {
    throw new Error('Calendly slot is unavailable');
  }
  return {
    event_type: type.uri,
    start_time: new Date(start).toISOString(),
    invitee: { email: client.email, name: client.name || client.email, timezone },
    location: { kind: location.kind, ...(location.location ? { location: location.location } : {}) },
  };
}

async function readEvidence(operation, eventUri, inviteeUri, provider) {
  const eventPath = pathFor(eventUri, 'scheduled_events');
  const [eventResponse, inviteeResponse] = await Promise.all([
    provider(eventPath), provider(inviteePath(eventUri, inviteeUri)),
  ]);
  const event = eventResponse?.resource;
  const invitee = inviteeResponse?.resource;
  const expectedStatus = operation.kind === 'cancel' ? 'canceled' : 'active';
  if (event?.uri !== eventUri || invitee?.uri !== inviteeUri || invitee.event !== eventUri ||
      !ownedEvent(event, operation) || event.status !== expectedStatus ||
      invitee.status !== expectedStatus || invitee.rescheduled || invitee.new_invitee) {
    throw new Error('Calendly event evidence differs from the operation');
  }
  if (operation.kind === 'confirm' && (event.event_type !== operation.provider_type_uri ||
      invitee.tracking?.utm_source !== trackingSource || invitee.tracking?.utm_content !== operation.id)) {
    throw new Error('Calendly evidence does not identify this claim');
  }
  if (operation.kind === 'cancel' && (operation.provider_event_uri !== eventUri ||
      operation.provider_invitee_uri !== inviteeUri)) {
    throw new Error('Calendly evidence does not identify the cancellation target');
  }
  return { eventUri, inviteeUri };
}

// Server-only candidate. The store must authenticate the actor, check booking
// ownership before exposing context, and wrap the service-only SQL RPCs.
export async function runCalendlyOperation({ bookingId, actorId, kind, store, provider, now = Date.now() }) {
  if (!actorId || !['confirm', 'cancel'].includes(kind)) throw new Error('Unauthorized operation');
  const existing = await store.begin(bookingId, actorId, kind, null);
  if (existing) return { state: existing.state, operationId: existing.id };

  const { snapshot, client } = await store.context(bookingId, actorId, kind);
  let payload;
  if (kind === 'confirm') {
    payload = await confirmationPayload(snapshot, client, provider, now);
  } else {
    const { provider_event_uri: eventUri, provider_invitee_uri: inviteeUri } = snapshot;
    const { resource: event } = await provider(pathFor(eventUri, 'scheduled_events'));
    const { resource: invitee } = await provider(inviteePath(eventUri, inviteeUri));
    const { resource: type } = await provider(pathFor(event?.event_type, 'event_types'));
    if (!ownedEvent(event, snapshot) || event.uri !== eventUri ||
        invitee?.uri !== inviteeUri || invitee.event !== eventUri ||
        invitee.rescheduled || invitee.new_invitee || type?.kind !== 'solo' ||
        type.uri !== event.event_type || type.profile?.type !== 'User' ||
        type.profile.owner !== snapshot.provider_user_uri ||
        !['active', 'canceled'].includes(event.status)) {
      throw new Error('Cannot verify Calendly cancellation target');
    }
    payload = { alreadyCanceled: event.status === 'canceled' };
  }

  const operation = await store.begin(bookingId, actorId, kind, snapshot);
  if (!operation?.dispatch) return { state: operation.state, operationId: operation.id };
  try {
    let eventUri = operation.provider_event_uri;
    let inviteeUri = operation.provider_invitee_uri;
    if (kind === 'confirm') {
      const { resource } = await provider('/invitees', {
        ...payload, tracking: { utm_source: trackingSource, utm_content: operation.id },
      });
      eventUri = resource?.event;
      inviteeUri = resource?.uri;
      inviteePath(eventUri, inviteeUri);
      await store.record(operation.id, eventUri, inviteeUri);
    } else if (!payload.alreadyCanceled) {
      await provider(pathFor(eventUri, 'scheduled_events') + '/cancellation', {
        reason: 'CareerDev Global booking cancelled',
      });
    }
    const evidence = await readEvidence(operation, eventUri, inviteeUri, provider);
    await store.finish(bookingId, operation.id, evidence.eventUri, evidence.inviteeUri);
    return { state: 'succeeded', operationId: operation.id };
  } catch {
    // Even if this write fails or the worker disappears, external_pending
    // permanently prevents another dispatch. A read-only repair can resume.
    await store.flag(operation.id).catch(() => {});
    return { state: 'reconciliation_required', operationId: operation.id };
  }
}

export async function reconcileCalendlyOperation({ bookingId, actorId, kind, eventUri, inviteeUri, store, provider }) {
  if (!actorId || !['confirm', 'cancel'].includes(kind)) throw new Error('Unauthorized operation');
  const operation = await store.begin(bookingId, actorId, kind, null);
  if (!operation) throw new Error('No operation to reconcile');
  if (operation.state === 'succeeded') return { state: operation.state, operationId: operation.id };
  const evidence = await readEvidence(
    operation, eventUri ?? operation.provider_event_uri, inviteeUri ?? operation.provider_invitee_uri, provider,
  );
  await store.finish(bookingId, operation.id, evidence.eventUri, evidence.inviteeUri);
  return { state: 'succeeded', operationId: operation.id };
}
