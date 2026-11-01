import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'jsr:@supabase/supabase-js@2.117.3';
import {applyRecordedEvent} from '../_shared/ai-billing-reconcile.ts';
const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
const reply=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers});
Deno.serve(async req=>{
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 const auth=req.headers.get('Authorization');if(!auth?.startsWith('Bearer '))return reply({error:'Authentication required'},401);
 const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,secret=Deno.env.get('PAYSTACK_SECRET_KEY');
 if(!secret||!service)return reply({error:'Billing unavailable'},503);
 try{
  const client=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const {data:{user},error}=await client.auth.getUser();if(error||!user)return reply({error:'Authentication required'},401);
  const {data:p}=await client.from('profiles').select('role,status').eq('id',user.id).maybeSingle();
  if(p?.status!=='active'||!['admin','staff'].includes(p.role))return reply({error:'Operator access required'},403);
  const body=await req.json();if(typeof body.event_id!=='string'||typeof body.reason!=='string'||body.reason.trim().length<10||body.reason.length>500)return reply({error:'Event and audit reason required'},400);
  const sb=createClient(url,service);
  const {data:event,error:readError}=await sb.from('ai_agent_subscription_webhook_events').select('*').eq('id',body.event_id).single();
  if(readError||!event)return reply({error:'Recorded event not found'},404);
  const result=await applyRecordedEvent(sb,secret,event,{id:user.id,reason:body.reason.trim()});
  return reply({processed:result?.processed===true,reconciliation_required:result?.processed!==true},result?.processed?200:409);
 }catch{return reply({error:'Reconciliation validation failed'},409)}
});
