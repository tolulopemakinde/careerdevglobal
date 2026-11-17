import "jsr:@supabase/functions-js@2.119.0/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.119.0";
import { oauthAcceptanceConfig } from "../_shared/calendly-acceptance.mjs";
import { createOAuthHandler } from "./handler.mjs";
const config = oauthAcceptanceConfig({
  enabled: Deno.env.get("CAREERDEV_CALENDLY_ACCEPTANCE_ENABLED"),
  backendUrl: Deno.env.get("SUPABASE_URL"),
  projectRef: Deno.env.get("CALENDLY_ACCEPTANCE_PROJECT_REF"),
  appOrigin: Deno.env.get("CAREERDEV_APP_URL"),
  hostUri: Deno.env.get("CALENDLY_ACCEPTANCE_HOST_URI"),
  organizationUri: Deno.env.get("CALENDLY_ACCEPTANCE_ORGANIZATION_URI"),
  webhookUri: Deno.env.get("CALENDLY_WEBHOOK_URI"),
  webhookSigningKey: Deno.env.get("CALENDLY_WEBHOOK_SIGNING_KEY"),
  participantEmails: (Deno.env.get("CALENDLY_ACCEPTANCE_PARTICIPANT_EMAILS") ?? "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean),
  appName: Deno.env.get("CALENDLY_ACCEPTANCE_APP_NAME"),
  redirectUri: Deno.env.get("CALENDLY_REDIRECT_URI"),
  clientId: Deno.env.get("CALENDLY_CLIENT_ID"),
  clientSecret: Deno.env.get("CALENDLY_CLIENT_SECRET"),
  encryptionKey: Deno.env.get("CALENDLY_TOKEN_ENCRYPTION_KEY"),
});
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const db = config && serviceKey ? createClient(config.backendUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
Deno.serve(createOAuthHandler({ config, db }));
