import { validPilotPayment } from "../_shared/pilot-billing.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const url=Deno.env.get("SUPABASE_URL")!;
const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? (()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")??"{}").default}catch{return undefined}})();
const secret=Deno.env.get("PAYSTACK_SECRET_KEY");
const headers={"Content-Type":"application/json"};
const reply=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers});
function hex(a:ArrayBuffer){return Array.from(new Uint8Array(a)).map(b=>b.toString(16).padStart(2,"0")).join("")}
async function hmac(s:string,b:Uint8Array){const k=await crypto.subtle.importKey("raw",new TextEncoder().encode(s),{name:"HMAC",hash:"SHA-512"},false,["sign"]);return hex(await crypto.subtle.sign("HMAC",k,b))}
async function sha(b:Uint8Array){return hex(await crypto.subtle.digest("SHA-256",b))}
function eq(a:string,b:string){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0}
async function ai(sb:any,event:any,type:string,eref:string,ref:string,hash:string){
 const d=event?.data??{}; const sc=String(d?.subscription_code??d?.subscription?.subscription_code??"").trim()||null;
 const cc=String(d?.customer?.customer_code??d?.customer_code??d?.subscription?.customer?.customer_code??"").trim()||null;
 const pc=String(d?.plan?.plan_code??d?.plan?.code??d?.subscription?.plan?.plan_code??"").trim()||null;
 let sub:any=null;
 if(ref){const r=await sb.from("ai_agent_subscriptions").select("*").eq("paystack_transaction_reference",ref).maybeSingle();sub=r.data}
 if(!sub&&sc){const r=await sb.from("ai_agent_subscriptions").select("*").eq("paystack_subscription_code",sc).maybeSingle();sub=r.data}
 const ins=await sb.from("ai_agent_subscription_webhook_events").insert({provider_key:"paystack",provider_event_reference:eref,event_type:type,signature_verified:true,processing_status:"verified",subscription_id:sub?.id??null,transaction_reference:ref||null,payload_hash:hash,payload:event}).select("id").single();
 if(ins.error){const r=await sb.from("ai_agent_subscription_webhook_events").select("id").eq("provider_key","paystack").eq("provider_event_reference",eref).maybeSingle();if(r.data)return {received:true,duplicate:true,ai_subscription:true,webhook_event_id:r.data.id};throw new Error("AI subscription webhook event could not be recorded")}
 if(!sub){await sb.from("ai_agent_subscription_webhook_events").update({processing_status:"unmatched",error_message:"No matching AI subscription found",processed_at:new Date().toISOString()}).eq("id",ins.data.id);return {processed:false,unmatched:true,ai_subscription:true,webhook_event_id:ins.data.id}}
 if(['cancelled','canceled'].includes(sub.status)){await sb.from("ai_agent_subscription_webhook_events").update({processing_status:"processed",processed_at:new Date().toISOString()}).eq("id",ins.data.id);return {processed:true,cancelled_preserved:true};}
 if(['charge.success','subscription.create','invoice.update'].includes(type) && !validPilotPayment(sub,d)){await sb.from("ai_agent_subscription_webhook_events").update({processing_status:"failed",error_message:"Pilot payment identity or price mismatch"}).eq("id",ins.data.id);return {processed:false,verification_required:true};}
 const u:any={updated_at:new Date().toISOString(),metadata:{...(sub.metadata??{}),last_webhook_event:type,last_webhook_event_reference:eref}};
 if(sc)u.paystack_subscription_code=sc;if(cc)u.paystack_customer_code=cc;
 const np=d?.next_payment_date??d?.subscription?.next_payment_date??null, paid=d?.paid_at??null;
 if(type==="subscription.create"){u.status="active";if(np)u.current_period_end=new Date(np).toISOString()}
 else if(type==="charge.success"){u.status="active";if(paid)u.current_period_start=new Date(paid).toISOString();if(np)u.current_period_end=new Date(np).toISOString()}
 else if(type==="invoice.payment_failed"){u.status="attention"}
 else if(type==="subscription.not_renew"){u.status="non_renewing"}
 else if(type==="subscription.disable"){u.status="cancelled"}
 else if(type==="invoice.update"){const st=String(d?.status??"").toLowerCase();if(st==="paid"||st==="success")u.status="active";if(st==="failed")u.status="attention"}
 const up=await sb.from("ai_agent_subscriptions").update(u).eq("id",sub.id);if(up.error){await sb.from("ai_agent_subscription_webhook_events").update({processing_status:"failed",error_message:up.error.message}).eq("id",ins.data.id);throw new Error("AI subscription state could not be updated")}
 await sb.from("ai_agent_subscription_webhook_events").update({processing_status:"processed",processed_at:new Date().toISOString()}).eq("id",ins.data.id);
 return {processed:true,ai_subscription:true,webhook_event_id:ins.data.id,subscription_id:sub.id,event_type:type}
}
Deno.serve(async req=>{if(req.method!=="POST")return reply({error:"Method not allowed"},405);if(!service||!secret)return reply({error:"Webhook credentials are not configured"},503);try{
 const raw=new Uint8Array(await req.arrayBuffer()), sig=(req.headers.get("x-paystack-signature")??"").trim().toLowerCase();if(!sig)return reply({error:"Missing Paystack signature"},401);if(!eq(await hmac(secret,raw),sig))return reply({error:"Invalid Paystack signature"},401);
 const hash=await sha(raw);let event:any;try{event=JSON.parse(new TextDecoder().decode(raw))}catch{return reply({error:"Invalid JSON payload"},400)}
 const type=String(event?.event??"").trim().toLowerCase(),d=event?.data??{},eref=String(d?.id??d?.reference??d?.subscription_code??d?.subscription?.subscription_code??"").trim(),ref=String(d?.reference??"").trim();if(!type||!eref)return reply({error:"Invalid Paystack event"},400);
 const sb=createClient(url,service);
 if((type==="charge.success"&&ref.startsWith("CDG-AI-"))||["subscription.create","subscription.disable","subscription.not_renew","invoice.create","invoice.payment_failed","invoice.update"].includes(type))return reply(await ai(sb,event,type,eref,ref,hash));
 const {data:ex}=await sb.from("marketplace_payment_webhook_events").select("id").eq("provider_key","paystack").eq("provider_event_reference",eref).maybeSingle();if(ex)return reply({received:true,duplicate:true,webhook_event_id:ex.id});
 let tid:string|null=null;if(ref){const {data:tx}=await sb.from("marketplace_transactions").select("id").eq("provider_key","paystack").eq("provider_transaction_reference",ref).maybeSingle();tid=tx?.id??null;if(!tid){const {data:i}=await sb.from("marketplace_payment_intents").select("transaction_id").eq("provider_key","paystack").eq("provider_intent_reference",ref).maybeSingle();tid=i?.transaction_id??null}}
 const {data:ins,error:ie}=await sb.from("marketplace_payment_webhook_events").insert({provider_key:"paystack",provider_event_reference:eref,event_type:type,signature_verified:true,processing_status:"verified",transaction_id:tid,payload_hash:hash,payload:event}).select("id").single();if(ie){return reply({error:"Webhook event could not be recorded"},500)}
 const {data:applied,error:ae}=await sb.rpc("apply_paystack_webhook_state",{p_webhook_event_id:ins.id});if(ae){await sb.from("marketplace_payment_webhook_events").update({processing_status:"failed",error_message:ae.message}).eq("id",ins.id);return reply({received:true,processed:false,webhook_event_id:ins.id,error:"Payment state could not be applied"},500)}
 return reply({received:true,processed:true,webhook_event_id:ins.id,result:applied})
}catch(e){return reply({error:"Webhook processing failed",detail:String(e)},500)}});
