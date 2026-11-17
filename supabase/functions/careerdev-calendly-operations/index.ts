import "jsr:@supabase/functions-js@2.119.0/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.119.0";
import { acceptanceTarget } from "../_shared/calendly-acceptance.mjs";
import { createOperationHandler } from "./handler.mjs";
const config = acceptanceTarget({
  enabled: Deno.env.get("CAREERDEV_CALENDLY_ACCEPTANCE_ENABLED"),
  projectRef: Deno.env.get("CALENDLY_ACCEPTANCE_PROJECT_REF"),
  backendUrl: Deno.env.get("SUPABASE_URL"),
  appOrigin: Deno.env.get("CAREERDEV_APP_URL"),
  hostUri: Deno.env.get("CALENDLY_ACCEPTANCE_HOST_URI"),
});
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const db = config && serviceKey ? createClient(config.backendUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
Deno.serve(createOperationHandler({ config, db,
  encryptionKey: Deno.env.get("CALENDLY_TOKEN_ENCRYPTION_KEY"),
  participantEmails: (Deno.env.get("CALENDLY_ACCEPTANCE_PARTICIPANT_EMAILS") ?? "").split(",").map(value => value.trim()).filter(Boolean),
}));
