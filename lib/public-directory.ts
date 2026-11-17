export type DirectoryResult<T> =
  | { status: 'ready'; items: T[] }
  | { status: 'unavailable'; items: T[] };

// Public read-only RPCs only. Never turn transport/permission errors into no inventory.
export async function readPublicDirectory<T>(
  url: string,
  key: string,
  rpc: 'get_public_coach_directory' | 'get_public_service_directory' | 'get_public_calendly_booking_links',
  send: typeof fetch = fetch,
): Promise<DirectoryResult<T>> {
  try {
    const response = await send(`${url}/rest/v1/rpc/${rpc}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: '{}',
      cache: 'no-store',
    });
    if (!response.ok) return { status: 'unavailable', items: [] };
    const items: unknown = await response.json();
    return Array.isArray(items)
      ? { status: 'ready', items: items as T[] }
      : { status: 'unavailable', items: [] };
  } catch {
    return { status: 'unavailable', items: [] };
  }
}
