const GROQ_CHAT_COMPLETIONS_URL = "https://api.groq.com/openai/v1/chat/completions";

export function sendStaffAdminGroqRequest({ apiKey, body, fetchImpl = fetch, timeoutMs = 45_000 }) {
  if (typeof apiKey !== "string" || !apiKey.trim()) throw new Error("Groq API key is required");
  if (!body || typeof body !== "object" || typeof body.model !== "string") throw new Error("A Groq chat completion body is required");

  return fetchImpl(GROQ_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
}
