import { createCalendlyTransport, runCalendlyOperation, reconcileCalendlyOperation } from '../_shared/calendly-operation.mjs';
import { createCalendlyLifecycle } from '../_shared/calendly-lifecycle.mjs';
import { decryptCalendlyValue } from '../_shared/calendly-acceptance.mjs';
export function createOperationHandler({ config, db, encryptionKey, participantEmails, send = fetch }) {
  const lifecycle = config && db ? createCalendlyLifecycle({ config: { ...config, encryptionKey }, db, send }) : null;
  const permitted = new Set((participantEmails ?? []).map(email => email.toLowerCase()));
  return async request => {
    const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' });
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
    if (!config || !db || !encryptionKey || !permitted.size || request.headers.get('Origin') !== config.appOrigin) return json({ error: 'Scheduling acceptance is unavailable.' }, 404);
    headers.set('Access-Control-Allow-Origin', config.appOrigin);
    headers.set('Access-Control-Allow-Headers', 'authorization,apikey,x-client-info,content-type');
    headers.set('Access-Control-Allow-Methods', 'POST,OPTIONS');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
    const bearer = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
    if (!bearer) return json({ error: 'Sign in to manage this booking.' }, 401);
    try {
      const { data: { user }, error: authError } = await db.auth.getUser(bearer);
      if (authError || !user || user.is_anonymous) return json({ error: 'Sign in to manage this booking.' }, 401);
      const { data: actor } = await db.from('profiles').select('role,status').eq('id', user.id).maybeSingle();
      if (actor?.status !== 'active' || !['client', 'coach'].includes(actor.role)) return json({ error: 'Booking unavailable.' }, 404);
      const raw = await request.text();
      if (new TextEncoder().encode(raw).length > 16384) return json({ error: 'Invalid request.' }, 413);
      let body; try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid request.' }, 400); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid request.' }, 400);
      const { booking_id: bookingId, kind, action = 'run' } = body;
      if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(bookingId ?? '') || !['confirm', 'cancel'].includes(kind) || !['run', 'reconcile'].includes(action)) return json({ error: 'Invalid request.' }, 400);
      async function rpc(name, args) {
        const { data, error } = await db.rpc(name, args);
        if (error) throw error;
        return data;
      }
      const args = { p_booking_id: bookingId, p_actor_id: user.id, p_kind: kind };
      const store = {
        begin: (_booking, _actor, _kind, snapshot) => rpc('begin_calendly_operation', { ...args, p_snapshot: snapshot }),
        record: (operationId, eventUri, inviteeUri) => rpc('record_calendly_receipt', { p_operation_id: operationId, p_event_uri: eventUri, p_invitee_uri: inviteeUri }),
        flag: operationId => rpc('flag_calendly_operation', { p_operation_id: operationId }),
        finish: (_booking, operationId, eventUri, inviteeUri) => rpc('finish_calendly_operation', { p_booking_id: bookingId, p_operation_id: operationId, p_event_uri: eventUri, p_invitee_uri: inviteeUri }),
        context: async () => context,
      };
      // Authorize in the existing service-only RPC before reading participant
      // details or encrypted connection rows. Never trust a caller-supplied actor.
      await store.begin(bookingId, user.id, kind, null);
      const { data: booking, error: bookingError } = await db.from('marketplace_booking_requests')
        .select('client_id,coach_id,coach_service_offering_id,requested_start,requested_end,calendly_event_uri,calendly_invitee_uri').eq('id', bookingId).maybeSingle();
      if (bookingError || !booking) throw new Error('Unavailable');
      const { data: client } = await db.from('clients').select('profile_id').eq('id', booking.client_id).maybeSingle();
      const { data: profile } = client ? await db.from('profiles').select('email,full_name,timezone,status').eq('id', client.profile_id).maybeSingle() : { data: null };
      if (!profile?.email || profile.status !== 'active' || !permitted.has(profile.email.toLowerCase())) throw new Error('Unapproved acceptance participant');
      const { data: offering } = await db.from('coach_service_offerings').select('calendly_event_type_uri').eq('id', booking.coach_service_offering_id).eq('coach_id', booking.coach_id).maybeSingle();
      const { data: connection, error: connectionError } = await db.from('calendly_connections')
        .select('calendly_user_uri,access_token_ciphertext,token_expires_at').eq('coach_id', booking.coach_id).eq('calendly_user_uri', config.hostUri).eq('active', true).maybeSingle();
      if (connectionError || !connection || connection.calendly_user_uri !== config.hostUri || (!config.clientId && !(Date.parse(connection.token_expires_at) > Date.now()))) return json({ error: 'Reconnect the designated acceptance host before scheduling.' }, 409);
      const context = {
        snapshot: { provider_user_uri: config.hostUri, provider_type_uri: offering?.calendly_event_type_uri,
          provider_event_uri: booking.calendly_event_uri, provider_invitee_uri: booking.calendly_invitee_uri,
          starts_at: booking.requested_start, ends_at: booking.requested_end },
        client: { email: profile.email, name: profile.full_name, timezone: profile.timezone },
      };
      const provider = createCalendlyTransport(config.clientId ? await lifecycle.accessToken(booking.coach_id) : await decryptCalendlyValue(connection.access_token_ciphertext, encryptionKey), send);
      const input = { bookingId, actorId: user.id, kind, store, provider };
      const result = action === 'reconcile'
        ? await reconcileCalendlyOperation({ ...input, eventUri: body.event_uri, inviteeUri: body.invitee_uri })
        : await runCalendlyOperation(input);
      return json(result, result.state === 'succeeded' ? 200 : 409);
    } catch {
      return json({ error: 'Scheduling could not be verified. Do not repeat an uncertain action; reconcile it first.' }, 409);
    }
  };
}
