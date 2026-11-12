import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  createCalendlyTransport,
  rescheduleCalendlyBooking,
} from "../_shared/calendly-operation.mjs";

const url = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const encryptionKey = Deno.env.get("CALENDLY_TOKEN_ENCRYPTION_KEY");
const projectRef = Deno.env.get("CALENDLY_RESCHEDULE_REHEARSAL_PROJECT_REF");
const allowedOrigin = Deno.env.get("CALENDLY_RESCHEDULE_REHEARSAL_ORIGIN");
const protectedProjects = new Set(["ufmhrmzumqkjvaezrmxf", "yyevuwvtrktrzwuzeddo"]);
const enabled = projectRef && /^[a-z0-9]{20}$/.test(projectRef) &&
  !protectedProjects.has(projectRef) && url === "https://" + projectRef + ".supabase.co" &&
  serviceKey && encryptionKey && allowedOrigin;
const db = enabled ? createClient(url!, serviceKey!, {
  auth: { persistSession: false, autoRefreshToken: false },
}) : null;

function decode(value: string) {
  return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
}

async function decryptToken(ciphertext: string) {
  const [iv, payload] = ciphertext.split(".");
  const rawKey = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(encryptionKey));
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(iv) }, key, decode(payload));
  return new TextDecoder().decode(plaintext);
}

Deno.serve(async request => {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
    Vary: "Origin",
  });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (!db || request.headers.get("Origin") !== allowedOrigin) {
    return json({ error: "Rescheduling is unavailable." }, 404);
  }
  headers.set("Access-Control-Allow-Origin", allowedOrigin!);
  headers.set("Access-Control-Allow-Headers", "authorization, apikey, x-client-info, content-type");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const token = request.headers.get("Authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return json({ error: "Sign in to manage this booking." }, 401);
  const { data: { user }, error: authError } = await db.auth.getUser(token);
  if (authError || !user || user.is_anonymous) return json({ error: "Sign in to manage this booking." }, 401);
  const body = await request.json().catch(() => null);
  const bookingId = body?.booking_id;
  if (typeof bookingId !== "string" ||
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(bookingId)) {
    return json({ error: "Invalid booking." }, 400);
  }

  // Resolve the actor from Supabase Auth and check the client relationship in
  // Postgres before reading the coach's encrypted provider connection.
  const args = { p_booking_id: bookingId, p_actor_id: user.id };
  const { data: snapshot, error: contextError } = await db.rpc("get_calendly_reschedule_context", args);
  if (contextError || !snapshot) return json({ error: "Rescheduling is unavailable." }, 404);

  try {
    const { data: booking, error: bookingError } = await db.from("marketplace_booking_requests")
      .select("coach_id").eq("id", bookingId).single();
    if (bookingError || !booking) throw new Error("Booking unavailable");
    const { data: connection, error: connectionError } = await db.from("calendly_connections")
      .select("access_token_ciphertext,token_expires_at").eq("coach_id", booking.coach_id)
      .eq("calendly_user_uri", snapshot.provider_user_uri).eq("active", true).single();
    if (connectionError || !connection || !(Date.parse(connection.token_expires_at) > Date.now())) {
      return json({ error: "The coach must reconnect Calendly before rescheduling." }, 409);
    }
    const transport = createCalendlyTransport(await decryptToken(connection.access_token_ciphertext));
    const result = await rescheduleCalendlyBooking({
      bookingId,
      actorId: user.id,
      provider: (path: string) => transport(path, undefined),
      store: {
        rescheduleContext: async () => snapshot,
        async applyReschedule(_id: string, _actorId: string, evidence: unknown) {
          const { error } = await db!.rpc("apply_calendly_reschedule", { ...args, p_evidence: evidence });
          if (error) throw error;
        },
      },
    });
    return json(result);
  } catch {
    return json({ error: "CareerDev could not verify the new appointment. Contact support if you changed the time in Calendly." }, 409);
  }
});
