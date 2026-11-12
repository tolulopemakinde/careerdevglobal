import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createRescheduleHandler } from "./handler.mjs";

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

Deno.serve(createRescheduleHandler({ db, allowedOrigin, encryptionKey }));
