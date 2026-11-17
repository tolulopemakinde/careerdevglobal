// Adapted from recovered source b3cae921d47fc33dd37e699f150df8d353a4f73a.
// Acceptance-only: no production defaults, token logging or generic callback target.
import { createWebhookWorker } from '../careerdev-calendly-webhook/handler.mjs';
import { createCalendlyLifecycle } from '../_shared/calendly-lifecycle.mjs';
import { b64url, sha256, encryptCalendlyValue, decryptCalendlyValue, grantedScopesCover } from '../_shared/calendly-acceptance.mjs';
export function createOAuthHandler({ config, db, send = fetch, now = Date.now }) {
  const lifecycle = config && db ? createCalendlyLifecycle({ config, db, send, now }) : null;
  return async request => {
    const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' });
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
    if (!config || !db) return json({ error: 'Calendly acceptance is unavailable.' }, 404);
    const url = new URL(request.url);
    const redirect = result => new Response(null, { status: 302, headers: { Location: `${config.appOrigin}/coach-dashboard?calendly=${result}`, 'Cache-Control': 'no-store' } });
    try {
      if (request.method === 'GET') {
        const state = url.searchParams.get('state');
        if (!state || !/^[A-Za-z0-9_-]{43}$/.test(state)) return redirect('expired');
        // DELETE RETURNING is the atomic single-use claim; concurrent callbacks
        // cannot both exchange the code. Never SELECT then unchecked DELETE.
        const { data: claim, error } = await db.from('calendly_oauth_states').delete()
          .eq('state_hash', await sha256(state)).gt('expires_at', new Date(now()).toISOString())
          .select('coach_id,code_verifier').maybeSingle();
        if (error || !claim) return redirect('expired');
        const { data: coach } = await db.from('coaches').select('profile_id,application_status').eq('id', claim.coach_id).maybeSingle();
        const { data: profile } = coach ? await db.from('profiles').select('role,status').eq('id', coach.profile_id).maybeSingle() : { data: null };
        if (!coach || !['approved', 'active'].includes(coach.application_status) || profile?.role !== 'coach' || profile.status !== 'active') return redirect('error');
        const code = url.searchParams.get('code');
        if (url.searchParams.has('error') || !code || code.length > 2048) return redirect('error');
        const response = await send('https://auth.calendly.com/oauth/token', {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + btoa(config.clientId + ':' + config.clientSecret) },
          body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: config.redirectUri, client_id: config.clientId, code_verifier: claim.code_verifier }),
        });
        if (!response.ok) return redirect('error');
        const token = await response.json();
        const scopes = typeof token.scope === 'string' ? token.scope.split(/\s+/).filter(Boolean) : [];
        if (!token.access_token || !grantedScopesCover(scopes, config.scopes) || !Number.isFinite(Number(token.expires_in)) || Number(token.expires_in) <= 0) return redirect('error');
        const meResponse = await send('https://api.calendly.com/users/me', { redirect: 'error', signal: AbortSignal.timeout(10000), headers: { Authorization: 'Bearer ' + token.access_token } });
        if (!meResponse.ok) return redirect('error');
        const me = (await meResponse.json()).resource;
        if (me?.uri !== config.hostUri) return redirect('error');
        const { error: savedError } = await db.from('calendly_connections').upsert({
          coach_id: claim.coach_id, calendly_user_uri: me.uri,
          calendly_user_email: me.email, calendly_user_name: me.name, calendly_scheduling_url: me.scheduling_url,
          access_token_ciphertext: await encryptCalendlyValue(token.access_token, config.encryptionKey),
          refresh_token_ciphertext: token.refresh_token ? await encryptCalendlyValue(token.refresh_token, config.encryptionKey) : null,
          token_expires_at: new Date(now() + Number(token.expires_in) * 1000).toISOString(), scopes, active: true, updated_at: new Date(now()).toISOString(),
        }, { onConflict: 'coach_id' });
        return redirect(savedError ? 'error' : 'connected');
      }
      if (request.headers.get('Origin') !== config.appOrigin) return json({ error: 'Calendly acceptance is unavailable.' }, 404);
      headers.set('Access-Control-Allow-Origin', config.appOrigin);
      headers.set('Access-Control-Allow-Headers', 'authorization,apikey,x-client-info,content-type');
      headers.set('Access-Control-Allow-Methods', 'POST,OPTIONS');
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
      const bearer = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
      if (!bearer) return json({ error: 'Unauthorized' }, 401);
      const { data: { user }, error: authError } = await db.auth.getUser(bearer);
      if (authError || !user || user.is_anonymous) return json({ error: 'Unauthorized' }, 401);
      const { data: profile } = await db.from('profiles').select('role,status').eq('id', user.id).maybeSingle();
      const { data: coach } = await db.from('coaches').select('id,application_status').eq('profile_id', user.id).maybeSingle();
      if (profile?.role !== 'coach' || profile.status !== 'active' || !coach || !['approved', 'active'].includes(coach.application_status)) return json({ error: 'Approved coach required.' }, 403);
      const raw = await request.text();
      if (new TextEncoder().encode(raw).length > 16384) return json({ error: 'Invalid request.' }, 413);
      let body; try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid request.' }, 400); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid request.' }, 400);
      if (body.action === 'authorize') {
        const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
        const state = b64url(crypto.getRandomValues(new Uint8Array(32)));
        const { error } = await db.from('calendly_oauth_states').insert({ coach_id: coach.id, state_hash: await sha256(state), code_verifier: verifier, expires_at: new Date(now() + 600000).toISOString() });
        if (error) return json({ error: 'Could not start Calendly connection.' }, 503);
        const authorize = new URL('https://auth.calendly.com/oauth/authorize');
        for (const [key, value] of Object.entries({ client_id: config.clientId, response_type: 'code', redirect_uri: config.redirectUri, code_challenge_method: 'S256', code_challenge: await sha256(verifier), scope: config.scopes.join(' '), state })) authorize.searchParams.set(key, value);
        return json({ authorization_url: authorize.toString() });
      }
      if (body.action === 'event_types') {
        const token = await lifecycle.accessToken(coach.id);
        const params = new URLSearchParams({ user: config.hostUri, active: 'true' });
        const response = await send('https://api.calendly.com/event_types?' + params, { redirect: 'error', signal: AbortSignal.timeout(10000), headers: { Authorization: 'Bearer ' + token } });
        if (!response.ok) return json({ error: 'Event types unavailable.' }, 503);
        const collection = (await response.json()).collection;
        if (!Array.isArray(collection)) return json({ error: 'Event types unavailable.' }, 503);
        return json({ event_types: collection.filter(type => type.active === true && type.profile?.type === 'User' && type.profile.owner === config.hostUri)
          .map(type => ({ uri: type.uri, name: type.name, duration: type.duration, duration_options: type.duration_options, locations: type.locations, scheduling_url: type.scheduling_url })) });
      }
      if (body.action === 'status') {
        const { data, error } = await db.from('calendly_connections').select('calendly_user_uri,calendly_user_email,calendly_user_name,calendly_scheduling_url,scopes,connected_at,active').eq('coach_id', coach.id).eq('calendly_user_uri', config.hostUri).maybeSingle();
        if (error) return json({ error: 'Calendly status unavailable.' }, 503);
        const connection = data?.calendly_user_uri === config.hostUri ? {
          calendly_user_uri: data.calendly_user_uri, calendly_user_email: data.calendly_user_email,
          calendly_user_name: data.calendly_user_name, calendly_scheduling_url: data.calendly_scheduling_url,
          scopes: data.scopes, connected_at: data.connected_at, active: data.active,
        } : null;
        return json({ connected: Boolean(connection?.active), connection, redirect_uri: config.redirectUri, requested_scopes: config.scopes });
      }
      if (body.action === 'webhook_recover') {
        const { data: receipts, error } = await db.from('calendly_acceptance_webhooks').select('digest').in('state', ['pending', 'processing']).limit(100);
        if (error) return json({ error: 'Recovery unavailable.' }, 503);
        const worker = createWebhookWorker({ config, db, send });
        let recovered = 0;
        for (const row of receipts ?? []) { try { await worker(row.digest); recovered++; } catch { /* durable pending receipt */ } }
        return json({ examined: receipts?.length ?? 0, recovered });
      }
      if (['subscription_ensure', 'subscription_list', 'subscription_delete', 'subscription_reconcile'].includes(body.action)) {
        return json(await lifecycle.subscription(coach.id, body.action.slice(13)));
      }
      if (body.action === 'disconnect') {
        return json(await lifecycle.disconnect(coach.id));
      }
      return json({ error: 'Unknown action.' }, 400);
    } catch { return request.method === 'GET' ? redirect('error') : json({ error: 'Calendly connection could not be verified.' }, 503); }
  };
}
