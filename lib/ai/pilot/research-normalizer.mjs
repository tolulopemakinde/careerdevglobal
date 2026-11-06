/**
 * Synthetic evaluation helper for Exa/Tavily results.
 * No external fetch, scraping, entitlement decisions or live job verification.
 * Never present an item as a current opening without authoritative checks.
 */

function usableUrl(raw) {
  if (typeof raw !== "string") return null;
  try {
    const value = new URL(raw);
    if (value.protocol !== "https:" || value.username || value.password) return null;
    const host = value.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") ||
        host.endsWith(".local") || host.endsWith(".internal") ||
        host.endsWith(".test") || !host.includes(".")) return null;
    // Prevent links to the most common private/link-local literal IP hosts.
    if (/^(127|10|0|192\.168)\./.test(host) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
        /^169\.254\./.test(host) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host) ||
        host === "[::1]" || host.startsWith("[fc") || host.startsWith("[fd") ||
        host.startsWith("[fe80:")) return null;
    value.hash = "";
    return value.toString();
  } catch {
    return null;
  }
}
function dateOrNull(input, fetchedAt) {
  if (typeof input !== "string" || !input.trim()) return null;
  const date = new Date(input);
  if (!Number.isFinite(date.getTime()) || date.getTime() > new Date(fetchedAt).getTime()) return null;
  return date.toISOString();
}
const safeText = (value, maxLength) =>
  typeof value === "string" ? value.replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, maxLength) : "";

/**
 * @param {'exa'|'tavily'} provider
 * @param {unknown} payload Raw provider JSON response
 * @param {string} fetchedAt Server-provided ISO timestamp
 * @returns {{provider: string, url: string, title: string, snippet: string, publishedAt: string|null, retrievedAt: string, verifiedOpen: false}[]}
 */
export function normalizeCareerSearchResults(provider, payload, fetchedAt) {
  if (provider !== "exa" && provider !== "tavily") throw new Error("UNAPPROVED_RESEARCH_PROVIDER");
  if (!Array.isArray(payload?.results)) throw new Error("INVALID_RESEARCH_PAYLOAD");
  if (!Number.isFinite(new Date(fetchedAt).getTime())) throw new Error("INVALID_RETRIEVAL_TIME");
  const seen = new Set(), output = [];
  for (const item of payload.results.slice(0, 30)) {
    const url = usableUrl(item?.url);
    if (!url) continue;
    // Same URL without tracking params remains an unverified source; no automatic URL fetch.
    const canonical = new URL(url);
    for (const key of [...canonical.searchParams.keys()]) {
      if (key.startsWith("utm_") || key === "fbclid" || key === "gclid") canonical.searchParams.delete(key);
    }
    const dedupe = canonical.href;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const title = safeText(item?.title, 180);
    if (!title) continue;
    const rawSnippet = provider === "exa"
      ? (item?.text ?? item?.summary ?? item?.highlights?.[0])
      : item?.content;
    output.push({
      provider, url: dedupe, title, snippet: safeText(rawSnippet, 700),
      publishedAt: dateOrNull(item?.publishedDate ?? item?.published_date, fetchedAt),
      retrievedAt: new Date(fetchedAt).toISOString(),
      verifiedOpen: false,
    });
    if (output.length >= 5) break;
  }
  return output;
}
