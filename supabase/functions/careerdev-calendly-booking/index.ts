import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const supabaseUrl=Deno.env.get("SUPABASE_URL")!,serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const clientId=Deno.env.get("CALENDLY_CLIENT_ID")!,clientSecret=Deno.env.get("CALENDLY_CLIENT_SECRET")!,encryptionKey=Deno.env.get("CALENDLY_TOKEN_ENCRYPTION_KEY")!;
const db=createClient(supabaseUrl,serviceKey);
function b64u(a:Uint8Array){let s="";for(const b of a)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
function fromB64u(s:string){s=s.replace(/-/g,"+").replace(/_/g,"/");while(s.length%4)s+="=";const b=atob(s);return Uint8Array.from(b,c=>c.charCodeAt(0))}
async function key(){const raw=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(encryptionKey));return crypto.subtle.importKey("raw",raw,"AES-GCM",false,["decrypt"])}
async function decrypt(value:string){const [iv,ct]=value.split(".");const k=await key();const p=await crypto.subtle.decrypt({name:"AES-GCM",iv:fromB64u(iv)},k,fromB64u(ct));return new TextDecoder().decode(p)}
function meetingInfo(locations:any[]){
 const loc=Array.isArray(locations)&&locations.length?locations[0]:null;
 if(!loc)return {platform:'unspecified',label:'Coach configured meeting',join_url:null,details:null};
 const kind=String(loc.kind||'').toLowerCase();
 const label=kind.includes('zoom')?'Zoom':kind.includes('google')?'Google Meet':kind.includes('microsoft')||kind.includes('teams')?'Microsoft Teams':kind.includes('phone')?'Phone':kind.includes('physical')?'In person':kind.includes('custom')?'Custom meeting':kind||'Online meeting';
 const join_url=loc.join_url||loc.location||null;
 return {platform:kind||'other',label,join_url,details:loc};
}
function json(data:any,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"}})}
async function getUser(req:Request){const h=req.headers.get("Authorization");if(!h?.startsWith("Bearer "))return null;const {data:{user}}=await db.auth.getUser(h.slice(7));return user??null}
async function getConnection(coachId:string){
 const {data:c}=await db.from("calendly_connections").select("*").eq("coach_id",coachId).eq("active",true).maybeSingle();
 if(!c)return null;
 let token=await decrypt(c.access_token_ciphertext);
 if(c.token_expires_at && new Date(c.token_expires_at).getTime()<Date.now()+120000 && c.refresh_token_ciphertext){
   const refresh=await decrypt(c.refresh_token_ciphertext);
   const r=await fetch("https://auth.calendly.com/oauth/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"refresh_token",refresh_token:refresh,client_id:clientId,client_secret:clientSecret})});
   const j=await r.json();
   if(!r.ok) throw new Error("Calendly authorization expired. Please reconnect Calendly.");
   token=j.access_token;
   await db.from("calendly_connections").update({
     access_token_ciphertext:await (async()=>{const raw=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(encryptionKey));const k=await crypto.subtle.importKey("raw",raw,"AES-GCM",false,["encrypt"]);const iv=crypto.getRandomValues(new Uint8Array(12));const ct=await crypto.subtle.encrypt({name:"AES-GCM",iv},k,new TextEncoder().encode(j.access_token));return `${b64u(iv)}.${b64u(new Uint8Array(ct))}`;})(),
     refresh_token_ciphertext:j.refresh_token?await (async()=>{const raw=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(encryptionKey));const k=await crypto.subtle.importKey("raw",raw,"AES-GCM",false,["encrypt"]);const iv=crypto.getRandomValues(new Uint8Array(12));const ct=await crypto.subtle.encrypt({name:"AES-GCM",iv},k,new TextEncoder().encode(j.refresh_token));return `${b64u(iv)}.${b64u(new Uint8Array(ct))}`;})():c.refresh_token_ciphertext,
     token_expires_at:new Date(Date.now()+Number(j.expires_in||7200)*1000).toISOString(),updated_at:new Date().toISOString()
   }).eq("id",c.id);
 }
 return {connection:c,token};
}
async function calGet(token:string,path:string){const r=await fetch("https://api.calendly.com"+path,{headers:{Authorization:`Bearer ${token}`}});const j=await r.json();if(!r.ok)throw new Error(j?.message||j?.title||"Calendly request failed");return j}
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"}});
 const user=await getUser(req);if(!user)return json({error:"Unauthorized"},401);
 const body=await req.json().catch(()=>({}));const action=body.action;
 const {data:coach}=await db.from("coaches").select("id").eq("profile_id",user.id).maybeSingle();
 if(action==="event_types"){
   if(!coach)return json({error:"Coach account required"},403);
   const c=await getConnection(coach.id);if(!c)return json({error:"Calendly is not connected"},400);
   const j=await calGet(c.token,`/event_types?user=${encodeURIComponent(c.connection.calendly_user_uri)}&active=true`);
   return json({event_types:(j.collection||[]).map((e:any)=>({uri:e.uri,name:e.name,duration:e.duration,duration_options:e.duration_options,locations:e.locations,scheduling_url:e.scheduling_url}))});
 }
 if(action==="book"){
   const bookingId=String(body.booking_id||"");if(!bookingId)return json({error:"booking_id required"},400);
   const {data:b}=await db.from("marketplace_booking_requests").select("id,client_id,coach_id,coach_service_offering_id,requested_start,requested_end,timezone,booking_status,calendly_event_uri").eq("id",bookingId).maybeSingle();
   if(!b)return json({error:"Booking not found"},404);
   if(b.coach_id!==coach?.id)return json({error:"Only the assigned coach can finalize this booking"},403);
   if(b.booking_status!=="requested")return json({error:"Booking is not awaiting confirmation"},409);
   const {data:off}=await db.from("coach_service_offerings").select("id,calendly_event_type_uri").eq("id",b.coach_service_offering_id).maybeSingle();
   if(!off?.calendly_event_type_uri)return json({error:"This service is not linked to a Calendly event type. Connect Calendly and map the service first."},400);
   const conn=await getConnection(b.coach_id);if(!conn)return json({error:"Coach Calendly account is not connected"},400);
   const {data:client}=await db.from("clients").select("profile_id").eq("id",b.client_id).maybeSingle();if(!client)return json({error:"Client not found"},404);
   const {data:profile}=await db.from("profiles").select("full_name,email,timezone").eq("id",client.profile_id).maybeSingle();
   if(!profile?.email)return json({error:"Client email is required before Calendly booking"},400);
   const et=await calGet(conn.token,`/event_types/${encodeURIComponent(off.calendly_event_type_uri.split("/").pop()||"")}`);
   const payload:any={event_type:off.calendly_event_type_uri,start_time:new Date(b.requested_start).toISOString(),invitee:{name:profile.full_name||profile.email,email:profile.email,timezone:profile.timezone||b.timezone||"UTC"}};
   if(Array.isArray(et.resource?.locations)&&et.resource.locations.length===1){const loc=et.resource.locations[0];payload.location={kind:loc.kind};if(loc.location)payload.location.location=loc.location;if(loc.additional_info)payload.location.additional_info=loc.additional_info;if(loc.phone_number)payload.location.phone_number=loc.phone_number}
   const r=await fetch("https://api.calendly.com/invitees",{method:"POST",headers:{"Authorization":`Bearer ${conn.token}`,"Content-Type":"application/json"},body:JSON.stringify(payload)});
   const j=await r.json();
   if(!r.ok){await db.from("marketplace_booking_requests").update({calendly_booking_status:"failed",calendly_last_error:j?.message||j?.title||"Calendly booking failed"}).eq("id",bookingId);return json({error:j?.message||j?.title||"Calendly booking failed"},400)}
   const eventUri=j.resource?.scheduled_event||j.resource?.event||null;
   let eventDetails:any=null;
   if(eventUri){ try{ eventDetails=await calGet(conn.token,`/scheduled_events/${encodeURIComponent(String(eventUri).split('/').pop()||'')}`); }catch{} }
   const info=meetingInfo(eventDetails?.resource?.location?[eventDetails.resource.location]:(eventDetails?.resource?.locations||j.resource?.locations||[]));
   const {data:saved,error:saveError}=await db.from('marketplace_booking_requests').update({calendly_event_uri:eventUri||j.resource?.uri||null,calendly_invitee_uri:j.resource?.uri||null,calendly_booking_status:'booked',calendly_last_error:null,meeting_platform:info.platform,meeting_platform_label:info.label,meeting_join_url:info.join_url,meeting_location_details:info.details}).eq('id',bookingId).select('id').maybeSingle();
   if(saveError||!saved){
     // External appointment may exist: never claim success or blindly retry creation.
     console.error('Calendly appointment created but local persistence failed', {bookingId,hasDbError:Boolean(saveError)});
     return json({error:'Calendly may have created an appointment, but CareerDev could not save it. Do not retry booking; contact support for reconciliation.',reconciliation_required:true},500);
   }
   return json({ok:true,calendly:j.resource,meeting:info});
 }
 if(action==="cancel"){
   const bookingId=String(body.booking_id||"");const {data:b}=await db.from("marketplace_booking_requests").select("id,coach_id,calendly_event_uri").eq("id",bookingId).maybeSingle();
   if(!b||b.coach_id!==coach?.id)return json({error:"Booking not found"},404);if(!b.calendly_event_uri)return json({ok:true});
   const conn=await getConnection(b.coach_id);if(!conn)return json({error:"Calendly connection unavailable"},400);
   const uuid=b.calendly_event_uri.split("/").filter(Boolean).pop();const r=await fetch(`https://api.calendly.com/scheduled_events/${uuid}/cancellation`,{method:"POST",headers:{"Authorization":`Bearer ${conn.token}`,"Content-Type":"application/json"},body:JSON.stringify({reason:String(body.reason||"CareerDev Global booking cancelled")})});if(!r.ok)return json({error:"Calendly cancellation failed"},400);return json({ok:true});
 }
 return json({error:"Unknown action"},400);
});