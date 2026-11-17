import "jsr:@supabase/functions-js@2.119.0/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.119.0";
import { acceptanceTarget, calendlyScopes } from "../_shared/calendly-acceptance.mjs";
import { createCalendlyLifecycle } from "../_shared/calendly-lifecycle.mjs";
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

const target = acceptanceTarget({ enabled: Deno.env.get("CAREERDEV_CALENDLY_ACCEPTANCE_ENABLED"), projectRef, backendUrl: url, appOrigin: allowedOrigin, hostUri: Deno.env.get("CALENDLY_ACCEPTANCE_HOST_URI") });
const lifecycle = target && db ? createCalendlyLifecycle({ config: { ...target, scopes: calendlyScopes, encryptionKey, clientId: Deno.env.get("CALENDLY_CLIENT_ID"), clientSecret: Deno.env.get("CALENDLY_CLIENT_SECRET") }, db }) : null;
Deno.serve(createRescheduleHandler({ db: target ? db : null, allowedOrigin, encryptionKey, tokenForCoach: lifecycle ? async (coachId: string, hostUri: string) => { if (hostUri !== target!.hostUri) throw new Error("Wrong acceptance host"); return lifecycle.accessToken(coachId); } : null }));
