import { decryptCalendlyValue, encryptCalendlyValue, grantedScopesCover } from './calendly-acceptance.mjs';
const origin = 'https://api.calendly.com';
export function subscriptionPath(uri) {
  if (!/^https:\/\/api[.]calendly[.]com\/webhook_subscriptions\/[A-Za-z0-9-]+$/.test(uri ?? '')) throw new Error('Invalid subscription');
  return uri.slice(origin.length);
}
async function result(query) { const { data, error } = await query; if (error) throw new Error('Lifecycle persistence unavailable'); return data; }
export function createCalendlyLifecycle({ config, db, send = fetch, now = Date.now }) {
  const basic = () => 'Basic ' + btoa(config.clientId + ':' + config.clientSecret);
  const request = async (url, options = {}) => {
    const response = await send(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Calendly lifecycle requires recovery');
    return response.status === 204 || response.headers.get('Content-Length') === '0' ? null : response;
  };
  const connection = async (coachId, inactive = false) => {
    let query = db.from('calendly_connections').select('*').eq('coach_id', coachId).eq('calendly_user_uri', config.hostUri);
    if (!inactive) query = query.eq('active', true);
    const row = await result(query.maybeSingle());
    if (!row || row.calendly_user_uri !== config.hostUri) throw new Error('Reconnect designated host');
    return row;
  };
  const claim = async (coachId, kind) => {
    const id = crypto.randomUUID();
    await result(db.from('calendly_acceptance_locks').insert({ coach_id: coachId, id, kind }));
    return id;
  };
  const unlock = (coachId, id) => result(db.from('calendly_acceptance_locks').delete().eq('coach_id', coachId).eq('id', id));
  const api = async (token, path, method = 'GET', body) => {
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('://')) throw new Error('Invalid provider path');
    const response = await request(origin + path, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return response ? response.json() : null;
  };
  async function accessToken(coachId) {
    let row = await connection(coachId);
    if (Date.parse(row.token_expires_at) > now() + 60000) return decryptCalendlyValue(row.access_token_ciphertext, config.encryptionKey);
    if (!config.clientId || !config.clientSecret || !row.refresh_token_ciphertext) throw new Error('Reconnect designated host');
    const id = await claim(coachId, 'refresh');
    // Read after the unique database claim. Never automatically steal a stale
    // refresh claim: a timeout may have rotated the single-use refresh token.
    row = await connection(coachId);
    if (Date.parse(row.token_expires_at) > now() + 60000) {
      await unlock(coachId, id); return decryptCalendlyValue(row.access_token_ciphertext, config.encryptionKey);
    }
    const response = await request('https://auth.calendly.com/oauth/token', { method: 'POST', headers: { Authorization: basic(), 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: await decryptCalendlyValue(row.refresh_token_ciphertext, config.encryptionKey) }) });
    const token = await response.json();
    const scopes = typeof token.scope === 'string' ? token.scope.split(/\s+/) : row.scopes;
    if (!token.access_token || !token.refresh_token || !grantedScopesCover(scopes ?? [], config.scopes) || !(Number(token.expires_in) > 0) || !Number.isFinite(Number(token.expires_in))) throw new Error('Invalid refresh grant');
    const me = await api(token.access_token, '/users/me');
    if (me?.resource?.uri !== config.hostUri) throw new Error('Wrong refreshed host');
    const saved = await result(db.from('calendly_connections').update({ access_token_ciphertext: await encryptCalendlyValue(token.access_token, config.encryptionKey), refresh_token_ciphertext: await encryptCalendlyValue(token.refresh_token, config.encryptionKey), token_expires_at: new Date(now() + Number(token.expires_in) * 1000).toISOString(), scopes, updated_at: new Date(now()).toISOString() }).eq('coach_id', coachId).eq('active', true).eq('access_token_ciphertext', row.access_token_ciphertext).select('coach_id').maybeSingle());
    if (!saved) throw new Error('Connection changed during refresh');
    await unlock(coachId, id); return token.access_token;
  }
  function owned(sub) {
    return /^https:\/\/api[.]calendly[.]com\/webhook_subscriptions\/[A-Za-z0-9-]+$/.test(sub?.uri ?? '') && sub.callback_url === config.webhookUri && sub.user === config.hostUri && sub.organization === config.organizationUri && sub.scope === 'user' && sub.events?.length === 2 && ['invitee.created', 'invitee.canceled'].every(e => sub.events.includes(e));
  }
  async function list(token) {
    const params = new URLSearchParams({ organization: config.organizationUri, user: config.hostUri, scope: 'user', count: '100' });
    const found = []; let page;
    for (let n = 0; n < 20; n++) {
      if (page) params.set('page_token', page);
      const response = await api(token, '/webhook_subscriptions?' + params);
      if (!Array.isArray(response?.collection)) throw new Error('Invalid subscription list');
      found.push(...response.collection.filter(owned));
      page = response.pagination?.next_page_token;
      if (!page) return found;
    }
    throw new Error('Subscription pagination incomplete');
  }
  async function subscription(coachId, action) {
    if (!/^https:\/\/api[.]calendly[.]com\/organizations\/[A-Za-z0-9-]+$/.test(config.organizationUri ?? '') || config.webhookUri !== config.backendUrl + '/functions/v1/careerdev-calendly-webhook' || !config.webhookSigningKey) throw new Error('Configure webhook settings');
    const token = await accessToken(coachId);
    if (action === 'list') return (await list(token)).map(s => ({ uri: s.uri, state: s.state }));
    const id = await claim(coachId, 'subscription');
    try {
      let row = await result(db.from('calendly_acceptance_subscriptions').select('*').eq('coach_id', coachId).maybeSingle());
      const existing = await list(token);
      if (existing.length > 1) throw new Error('Duplicate subscriptions require owner review');
      if (existing.length === 1) {
        row = { coach_id: coachId, uri: existing[0].uri, state: existing[0].state === 'active' ? 'active' : 'uncertain' };
        await result(db.from('calendly_acceptance_subscriptions').upsert(row));
      } else if (action === 'ensure') {
        // Durable intent precedes POST. A prior uncertain create is reconciled
        // only by listing; zero results never authorizes another create.
        if (row && row.state !== 'deleted') throw new Error('Subscription create outcome uncertain');
        await result(db.from('calendly_acceptance_subscriptions').upsert({ coach_id: coachId, uri: null, state: 'creating' }));
        const response = await api(token, '/webhook_subscriptions', 'POST', { url: config.webhookUri, events: ['invitee.created', 'invitee.canceled'], organization: config.organizationUri, user: config.hostUri, scope: 'user' });
        if (!owned(response?.resource) || response.resource.state !== 'active') throw new Error('Subscription create requires recovery');
        row = { coach_id: coachId, uri: response.resource.uri, state: 'active' };
        await result(db.from('calendly_acceptance_subscriptions').upsert(row));
      }
      if (action === 'delete') {
        if (existing.length === 1) await api(token, subscriptionPath(existing[0].uri), 'DELETE');
        await result(db.from('calendly_acceptance_subscriptions').upsert({ coach_id: coachId, uri: row?.uri ?? null, state: 'deleted' }));
        return { state: 'deleted' };
      }
      return { state: row?.state ?? 'missing', uri: row?.uri ?? null };
    } finally { await unlock(coachId, id); }
  }
  async function disconnect(coachId) {
    // Serialize with refresh/subscription writes. A failed refresh claim is
    // intentionally not stolen; reconnect/owner grant revocation is required.
    const previous = await connection(coachId, true);
    let id, row;
    if (!previous.active) {
      const lock = await result(db.from('calendly_acceptance_locks').select('*').eq('coach_id', coachId).maybeSingle());
      if (lock?.kind !== 'revoke') throw new Error('Owner revocation review required');
      id = lock.id; row = previous;
    } else {
      await accessToken(coachId);
      await subscription(coachId, 'delete');
      id = await claim(coachId, 'revoke');
      row = await connection(coachId, true);
    }
    const token = await decryptCalendlyValue(row.access_token_ciphertext, config.encryptionKey);
    await result(db.from('calendly_connections').update({ active: false }).eq('coach_id', coachId).eq('access_token_ciphertext', row.access_token_ciphertext));
    // Keep ciphertext and claim on a failed revoke so a server-only recovery
    // can retry the idempotent revocation; never report local-only success.
    for (const value of [row.refresh_token_ciphertext ? await decryptCalendlyValue(row.refresh_token_ciphertext, config.encryptionKey) : null, token].filter(Boolean)) {
      await request('https://auth.calendly.com/oauth/revoke', { method: 'POST', headers: { Authorization: basic(), 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: value, client_id: config.clientId, client_secret: config.clientSecret }) });
    }
    await result(db.from('calendly_connections').delete().eq('coach_id', coachId).eq('access_token_ciphertext', row.access_token_ciphertext));
    await unlock(coachId, id); return { ok: true };
  }
  return { accessToken, subscription, disconnect, api };
}
