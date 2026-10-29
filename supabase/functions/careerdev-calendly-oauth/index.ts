import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const clientId = Deno.env.get("CALENDLY_CLIENT_ID")!;
const clientSecret = Deno.env.get("CALENDLY_CLIENT_SECRET")!;
const redirectUri = Deno.env.get("CALENDLY_REDIRECT_URI") || `${supabaseUrl}/functions/v1/careerdev-calendly-oauth`;
const appUrl = Deno.env.get("CAREERDEV_APP_URL") || "https://careerdevglobal-nine.vercel.app";
const encryptionKey = Deno.env.get("CALENDLY_TOKEN_ENCRYPTION_KEY");

const db = createClient(supabaseUrl, serviceKey);

function b64url(bytes: Uint8Array) {
  let s = ""; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
async function sha256(value:string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return b64url(new Uint8Array(h));
}
async function pkceVerifier() {
  const bytes = crypto.getRandomValues(new Uint8Array(48));
  return b64url(bytes);
}
async function pkceChallenge(v:string) {
  return sha256(v);
}
async function encrypt(value:string) {
  if (!encryptionKey) throw new Error("CALENDLY_TOKEN_ENCRYPTION_KEY is not configured");
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(encryptionKey));
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({name:"AES-GCM",iv}, key, new TextEncoder().encode(value));
  return `${b64url(iv)}.${b64url(new Uint8Array(ct))}`;
}
function cors() { return {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"}; }
function json(data:any,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json",...cors()}});}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "OPTIONS") return new Response("ok",{headers:cors()});

  // OAuth callback is intentionally public; state is single-use and short-lived.
  if (url.searchParams.has("code") || url.searchParams.has("error")) {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const oauthError = url.searchParams.get("error");
    const oauthErrorDescription = url.searchParams.get("error_description");
    if (oauthError) {
      console.error("Calendly OAuth authorization error", { error: oauthError, description: oauthErrorDescription });
      return Response.redirect(`${appUrl}/coach-dashboard?calendly=error`,302);
    }
    if (!code || !state) return Response.redirect(`${appUrl}/coach-dashboard?calendly=error`,302);
    const stateHash = await sha256(state);
    const {data: oauthState} = await db.from("calendly_oauth_states").select("*").eq("state_hash",stateHash).maybeSingle();
    if (!oauthState || new Date(oauthState.expires_at).getTime() < Date.now()) {
      return Response.redirect(`${appUrl}/coach-dashboard?calendly=expired`,302);
    }
    await db.from("calendly_oauth_states").delete().eq("id",oauthState.id);
    const tokenRes = await fetch("https://auth.calendly.com/oauth/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({
      grant_type:"authorization_code",code,redirect_uri:redirectUri,client_id:clientId,client_secret:clientSecret,code_verifier:oauthState.code_verifier
    })});
    const token = await tokenRes.json();
    if (!tokenRes.ok) return Response.redirect(`${appUrl}/coach-dashboard?calendly=error`,302);
    const meRes = await fetch("https://api.calendly.com/users/me",{headers:{Authorization:`Bearer ${token.access_token}`}});
    const me = await meRes.json();
    if (!meRes.ok) return Response.redirect(`${appUrl}/coach-dashboard?calendly=error`,302);
    const {error: upsertError} = await db.from("calendly_connections").upsert({
      coach_id: oauthState.coach_id,
      calendly_user_uri: me.resource.uri,
      calendly_user_email: me.resource.email,
      calendly_user_name: me.resource.name,
      calendly_scheduling_url: me.resource.scheduling_url,
      access_token_ciphertext: await encrypt(token.access_token),
      refresh_token_ciphertext: token.refresh_token ? await encrypt(token.refresh_token) : null,
      token_expires_at: new Date(Date.now()+Number(token.expires_in||7200)*1000).toISOString(),
      scopes: String(token.scope||"").split(" ").filter(Boolean),
      active:true,
      updated_at:new Date().toISOString()
    },{onConflict:"coach_id"});
    if (upsertError) return Response.redirect(`${appUrl}/coach-dashboard?calendly=error`,302);
    return Response.redirect(`${appUrl}/coach-dashboard?calendly=connected`,302);
  }

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({error:"Unauthorized"},401);
  const jwt = auth.slice(7);
  const {data:{user},error:userError} = await db.auth.getUser(jwt);
  if (userError || !user) return json({error:"Unauthorized"},401);
  const body = await req.json().catch(()=>({}));
  const action = body.action;

  const {data: coach} = await db.from("coaches").select("id").eq("profile_id",user.id).maybeSingle();
  if (!coach) return json({error:"Approved coach account required"},403);

  if (action === "authorize") {
    const verifier = await pkceVerifier();
    const challenge = await pkceChallenge(verifier);
    const stateBytes = crypto.getRandomValues(new Uint8Array(32));
    const state = b64url(stateBytes);
    const {error} = await db.from("calendly_oauth_states").insert({coach_id:coach.id,state_hash:await sha256(state),code_verifier:verifier,expires_at:new Date(Date.now()+10*60*1000).toISOString()});
    if (error) return json({error:error.message},500);
    const authUrl = new URL("https://auth.calendly.com/oauth/authorize");
    authUrl.searchParams.set("client_id",clientId);
    authUrl.searchParams.set("response_type","code");
    authUrl.searchParams.set("redirect_uri",redirectUri);
    authUrl.searchParams.set("code_challenge_method","S256");
    authUrl.searchParams.set("code_challenge",challenge);
    authUrl.searchParams.set("scope","users:read event_types:read scheduled_events:write");
    authUrl.searchParams.set("state",state);
    return json({authorization_url:authUrl.toString()});
  }

  if (action === "status") {
    const {data} = await db.from("calendly_connections").select("calendly_user_email,calendly_user_name,calendly_scheduling_url,connected_at,active").eq("coach_id",coach.id).maybeSingle();
    return json({connected:Boolean(data?.active),connection:data||null});
  }

  if (action === "disconnect") {
    await db.from("calendly_connections").update({active:false,updated_at:new Date().toISOString()}).eq("coach_id",coach.id);
    return json({ok:true});
  }

  return json({error:"Unknown action"},400);
});