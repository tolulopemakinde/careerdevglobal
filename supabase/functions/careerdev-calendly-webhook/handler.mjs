import { sha256 } from '../_shared/calendly-acceptance.mjs';
import { createCalendlyLifecycle } from '../_shared/calendly-lifecycle.mjs';
import { createCalendlyTransport, reconcileCalendlyOperation, runCalendlyOperation, rescheduleCalendlyBooking } from '../_shared/calendly-operation.mjs';
async function data(query) { const r = await query; if (r.error) throw new Error('Webhook persistence unavailable'); return r.data; }
export async function verifyCalendlySignature(raw, header, key, now = Date.now()) {
  if (!key || typeof header !== 'string') return false;
  const parts = header.split(',').map(s => s.trim());
  const timestamps = parts.filter(s => s.startsWith('t='));
  if (timestamps.length !== 1 || !/^t=\d{10}$/.test(timestamps[0])) return false;
  const timestamp = timestamps[0].slice(2);
  if (Math.abs(now / 1000 - Number(timestamp)) > 180) return false;
  const hmac = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  for (const part of parts.filter(s => /^v1=[a-f0-9]{64}$/i.test(s))) {
    const signature = Uint8Array.from(part.slice(3).match(/../g), x => parseInt(x, 16));
    if (await crypto.subtle.verify('HMAC', hmac, signature, new TextEncoder().encode(timestamp + '.' + raw))) return true;
  }
  return false;
}
export function createWebhookWorker({ config, db, send = fetch }) {
  const lifecycle = createCalendlyLifecycle({ config, db, send });
  return async digest => {
    const receipt = await data(db.rpc('claim_calendly_webhook', { p_digest: digest }));
    if (!receipt) return;
    try {
      const operation = await data(db.rpc('lookup_calendly_webhook_operation', { p_operation_id: receipt.operation_id, p_event_uri: receipt.event_uri, p_invitee_uri: receipt.invitee_uri }));
      if (!operation || operation.provider_user_uri !== config.hostUri) {
        await data(db.from('calendly_acceptance_webhooks').update({ state: 'ignored', lease_until: null }).eq('digest', digest)); return;
      }
      const booking = await data(db.from('marketplace_booking_requests').select('coach_id,client_id,booking_status,calendly_event_uri,calendly_invitee_uri').eq('id', operation.booking_id).single());
      const client = await data(db.from('clients').select('profile_id').eq('id', booking.client_id).single());
      const profile = await data(db.from('profiles').select('email,status').eq('id', client.profile_id).single());
      if (profile?.status !== 'active' || !(config.participantEmails ?? []).includes(profile.email?.toLowerCase())) throw new Error('Unapproved participant');
      const token = await lifecycle.accessToken(booking.coach_id);
      const transport = createCalendlyTransport(token, send);
      // Recovery is read-only at the provider even for a cancellation event.
      const provider = (path, body) => { if (body !== undefined) throw new Error('Webhook cannot dispatch provider writes'); return transport(path); };
      const rpc = (name, args) => data(db.rpc(name, args));
      const args = { p_booking_id: operation.booking_id, p_actor_id: operation.actor_id, p_kind: operation.kind };
      const store = {
        begin: (_b, _a, kind, snapshot) => rpc('begin_calendly_operation', { ...args, p_kind: kind, p_snapshot: snapshot }),
        finish: (bookingId, id, event, invitee) => rpc('finish_calendly_operation', { p_booking_id: bookingId, p_operation_id: id, p_event_uri: event, p_invitee_uri: invitee }),
      };
      if (operation.state !== 'succeeded') {
        await reconcileCalendlyOperation({ bookingId: operation.booking_id, actorId: operation.actor_id, kind: operation.kind, eventUri: receipt.event_uri, inviteeUri: receipt.invitee_uri, store, provider });
      } else if (receipt.event === 'invitee.canceled' && booking.booking_status !== 'cancelled' && booking.calendly_invitee_uri === receipt.invitee_uri) {
        const invitee = (await provider(receipt.invitee_uri.slice('https://api.calendly.com'.length))).resource;
        if (invitee?.status !== 'canceled') throw new Error('Cancellation not verified');
        if (invitee.rescheduled === true) {
          await rescheduleCalendlyBooking({ bookingId: operation.booking_id, actorId: client.profile_id, provider, store: {
            rescheduleContext: () => rpc('get_calendly_reschedule_context', { p_booking_id: operation.booking_id, p_actor_id: client.profile_id }),
            applyReschedule: (bookingId, actorId, evidence) => rpc('apply_calendly_reschedule', { p_booking_id: bookingId, p_actor_id: actorId, p_evidence: evidence }),
          } });
        } else {
          const context = await rpc('get_calendly_reschedule_context', { p_booking_id: operation.booking_id, p_actor_id: client.profile_id });
          const result = await runCalendlyOperation({ bookingId: operation.booking_id, actorId: client.profile_id, kind: 'cancel', provider, store: {
            ...store, context: async () => ({ snapshot: context }), flag: id => rpc('flag_calendly_operation', { p_operation_id: id }),
          } });
          if (result.state !== 'succeeded') throw new Error('Cancellation requires recovery');
        }
      }
      await data(db.from('calendly_acceptance_webhooks').update({ state: 'done', lease_until: null, processed_at: new Date().toISOString() }).eq('digest', digest));
    } catch {
      // A crash lease can be reclaimed; processing repeats GETs and idempotent
      // database completion, never invitee/cancellation POSTs.
      await data(db.from('calendly_acceptance_webhooks').update({ state: 'pending', lease_until: null }).eq('digest', digest));
      throw new Error('Webhook requires recovery');
    }
  };
}
export function createWebhookHandler({ config, db, worker, schedule, now = Date.now }) {
  return async request => {
    const json = (body, status) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
    if (!config?.webhookSigningKey || !db) return json({ error: 'Unavailable' }, 404);
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    try {
      // Bound the streamed body before allocating or parsing attacker input.
      const reader = request.body?.getReader(); if (!reader) return json({ error: 'Invalid request' }, 400);
      const chunks = []; let size = 0;
      while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 131072) { await reader.cancel(); return json({ error: 'Too large' }, 413); } chunks.push(value); }
      const bytes = new Uint8Array(size); let offset = 0; for (const c of chunks) { bytes.set(c, offset); offset += c.length; }
      const raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (!await verifyCalendlySignature(raw, request.headers.get('Calendly-Webhook-Signature'), config.webhookSigningKey, now())) return json({ error: 'Invalid signature' }, 401);
      const body = JSON.parse(raw), payload = body.payload;
      if (!['invitee.created', 'invitee.canceled'].includes(body.event)) return json({ accepted: true }, 202);
      const event = payload?.event, invitee = payload?.uri;
      if (!/^https:\/\/api[.]calendly[.]com\/scheduled_events\/[A-Za-z0-9-]+$/.test(event ?? '') || !invitee?.startsWith(event + '/invitees/') || !/^[A-Za-z0-9-]+$/.test(invitee.slice((event + '/invitees/').length))) return json({ error: 'Invalid resource' }, 400);
      const operation = payload.tracking?.utm_source === 'careerdev-marketplace' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(payload.tracking?.utm_content ?? '') ? payload.tracking.utm_content : null;
      // Semantic identity survives a provider retry with a new signature/time.
      // Never persist raw participant payloads or headers.
      const digest = await sha256(body.event + '\n' + event + '\n' + invitee);
      const inserted = await db.from('calendly_acceptance_webhooks').insert({ digest, event: body.event, event_uri: event, invitee_uri: invitee, operation_id: operation });
      if (inserted.error && inserted.error.code !== '23505') return json({ error: 'Receipt unavailable' }, 503);
      if (schedule) schedule(worker(digest).catch(() => {}));
      else await worker(digest).catch(() => {});
      return json({ accepted: true }, 202);
    } catch { return json({ error: 'Invalid webhook' }, 400); }
  };
}
