const protectedProjects = new Set(['ufmhrmzumqkjvaezrmxf', 'yyevuwvtrktrzwuzeddo']);
export const calendlyScopes = ['users:read', 'event_types:read', 'scheduled_events:write'];
export function acceptanceTarget({ enabled, projectRef, backendUrl, appOrigin, hostUri }) {
  if (enabled !== 'true' || !/^[a-z0-9]{20}$/.test(projectRef ?? '') || protectedProjects.has(projectRef) ||
      backendUrl !== `https://${projectRef}.supabase.co` ||
      !/^https:\/\/api[.]calendly[.]com\/users\/[A-Za-z0-9-]+$/.test(hostUri ?? '')) return null;
  try {
    const app = new URL(appOrigin);
    if (app.protocol !== 'https:' || app.origin !== appOrigin || app.username || app.password ||
        app.hostname === 'careerdevglobal-nine.vercel.app' || app.hostname === 'careerdevglobal.com' ||
        app.hostname.endsWith('.careerdevglobal.com')) return null;
  } catch { return null; }
  return { projectRef, backendUrl, appOrigin, hostUri };
}
export function oauthAcceptanceConfig(input) {
  const target = acceptanceTarget(input);
  if (!target || !input.appName?.trim() || !input.clientId || !input.clientSecret || !input.encryptionKey ||
      input.redirectUri !== `${target.backendUrl}/functions/v1/careerdev-calendly-oauth`) return null;
  return { ...target, ...input, scopes: [...calendlyScopes] };
}
export function b64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export async function sha256(value) {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
}
export async function encryptCalendlyValue(value, encryptionKey) {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(encryptionKey));
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(value));
  return `${b64url(iv)}.${b64url(new Uint8Array(ciphertext))}`;
}
export async function decryptCalendlyValue(value, encryptionKey) {
  const decode = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  const [iv, payload] = value.split('.');
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(encryptionKey));
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(iv) }, key, decode(payload)));
}
export function grantedScopesCover(granted, requested) {
  const scopes = new Set(granted);
  return requested.every(scope => scopes.has(scope) || (scope.endsWith(':read') && scopes.has(scope.replace(/:read$/, ':write'))));
}
