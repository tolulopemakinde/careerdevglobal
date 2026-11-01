import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'jsr:@supabase/supabase-js@2.117.3';
import {verifySubscriptionPayment} from '../_shared/ai-billing-provider.ts';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Content-Type':'application/json','Cache-Control':'no-store'};
const reply=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers});
function key(name:string,fallback?:string){try{return JSON.parse(Deno.env.get(name)||'{}').default??fallback}catch{return fallback}}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 const auth=req.headers.get('Authorization');if(!auth?.startsWith('Bearer '))return reply({error:'Authentication required'},401);
 const url=Deno.env.get('SUPABASE_URL')!,anon=key('SUPABASE_PUBLISHABLE_KEYS',Deno.env.get('SUPABASE_ANON_KEY')),service=key('SUPABASE_SECRET_KEYS',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')),secret=Deno.env.get('PAYSTACK_SECRET_KEY');
 if(!url||!anon||!service||!secret)return reply({error:'Billing unavailable'},503);
 try{
  const client=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const {data:{user},error}=await client.auth.getUser();if(error||!user)return reply({error:'Authentication required'},401);
  const {data:profile}=await client.from('profiles').select('role,status').eq('id',user.id).maybeSingle();
  if(profile?.status!=='active'||!['client','coach'].includes(profile.role))return reply({error:'Access denied'},403);
  const {reference}=await req.json();if(typeof reference!=='string'||!/^CDG-AI-[a-f0-9]{24,32}$/.test(reference))return reply({error:'Invalid payment reference'},400);
  const sb=createClient(url,service);
  const {data:sub,error:readError}=await sb.from('ai_agent_subscriptions').select('*').eq('user_id',user.id).eq('paystack_transaction_reference',reference).maybeSingle();
  if(readError||!sub)return reply({error:'Owned payment record not found'},404);
  const payment=await verifySubscriptionPayment(secret,sub,reference);
  const identity='provider-verify:'+reference;
  const payload={event:'charge.success',data:{reference,subscription_code:payment.subscription_code}};
  const bytes=new TextEncoder().encode(JSON.stringify(payload));
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  const insert=await sb.from('ai_agent_subscription_webhook_events').insert({provider_key:'paystack',provider_event_reference:identity,event_type:'charge.success',signature_verified:false,verification_source:'provider_api',verified_payment:payment,processing_status:'verified',subscription_id:sub.id,transaction_reference:reference,payload_hash:hash,payload}).select('id').single();
  let id=insert.data?.id;
  if(insert.error){const found=await sb.from('ai_agent_subscription_webhook_events').select('id,payload_hash').eq('provider_key','paystack').eq('provider_event_reference',identity).single();if(found.error||found.data?.payload_hash!==hash)throw new Error('Verification identity conflict');id=found.data.id}
  const {data:applied,error:applyError}=await sb.rpc('apply_ai_subscription_webhook_state',{p_event_id:id});
  if(applyError||!applied?.processed)return reply({error:'Payment received; reconciliation is pending'},409);
  const {data:latest,error:latestError}=await sb.from('ai_agent_subscriptions').select('status,current_period_end,plan_key').eq('id',sub.id).eq('user_id',user.id).single();
  if(latestError)throw new Error('Account refresh failed');
  return reply({payment_verified:true,status:latest.status,plan_key:latest.plan_key,current_period_end:latest.current_period_end,access_active:['active','non_renewing','attention'].includes(latest.status)&&Date.parse(latest.current_period_end)>Date.now()});
 }catch{return reply({error:'Payment verification is pending provider reconciliation. Do not pay again.'},409)}
});
