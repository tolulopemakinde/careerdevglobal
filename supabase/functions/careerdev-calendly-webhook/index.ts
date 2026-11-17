import "jsr:@supabase/functions-js@2.119.0/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.119.0";
import { acceptanceTarget, calendlyScopes } from "../_shared/calendly-acceptance.mjs";
import { createWebhookHandler, createWebhookWorker } from "./handler.mjs";
const target = acceptanceTarget({ enabled: Deno.env.get("CAREERDEV_CALENDLY_ACCEPTANCE_ENABLED"), projectRef: Deno.env.get("CALENDLY_ACCEPTANCE_PROJECT_REF"), backendUrl: Deno.env.get("SUPABASE_URL"), appOrigin: Deno.env.get("CAREERDEV_APP_URL"), hostUri: Deno.env.get("CALENDLY_ACCEPTANCE_HOST_URI") });
const config = target ? { ...target, scopes: calendlyScopes, encryptionKey: Deno.env.get("CALENDLY_TOKEN_ENCRYPTION_KEY"), clientId: Deno.env.get("CALENDLY_CLIENT_ID"), clientSecret: Deno.env.get("CALENDLY_CLIENT_SECRET"), webhookSigningKey: Deno.env.get("CALENDLY_WEBHOOK_SIGNING_KEY"), participantEmails: (Deno.env.get("CALENDLY_ACCEPTANCE_PARTICIPANT_EMAILS") ?? "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean) } : null;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const db = config && serviceKey ? createClient(config.backendUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
Deno.serve(createWebhookHandler({ config, db, worker: db ? createWebhookWorker({ config, db }) : null, schedule: (promise: Promise<unknown>) => EdgeRuntime.waitUntil(promise) }));
