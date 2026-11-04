import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'jsr:@supabase/supabase-js@2.117.3';
import {paystackRequest} from '../_shared/ai-billing-provider.ts';
import {normalizePaymentAdjustment} from '../_shared/ai-payment-adjustments.ts';
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(async req=>{
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 const authorization=req.headers.get('Authorization');if(!authorization?.startsWith('Bearer '))return reply({error:'Authentication required'},401);
 const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),secret=Deno.env.get('PAYSTACK_SECRET_KEY');
 if(!service||!secret)return reply({error:'Billing unavailable'},503);
 try{
  const client=createClient(url,anon,{global:{headers:{Authorization:authorization}}});
  const {data:{user},error}=await client.auth.getUser();if(error||!user)return reply({error:'Authentication required'},401);
  const {data:profile}=await client.from('profiles').select('role,status').eq('id',user.id).maybeSingle();
  if(profile?.status!=='active'||!['admin','staff'].includes(profile.role))return reply({error:'Operator access required'},403);
  const sb=createClient(url,service),config=await sb.from('ai_refund_policy_config').select('enabled').eq('id',true).single();
  if(config.error||!config.data.enabled)return reply({error:'Refund policy disabled'},503);
  const body=await req.json();
  if(!['refund','dispute'].includes(body.kind)||typeof body.provider_object_id!=='string'||!/^\d{1,30}$/.test(body.provider_object_id)||typeof body.reference!=='string'||typeof body.reason!=='string'||body.reason.trim().length<10||body.reason.length>500)return reply({error:'Payment, provider object and audit reason required'},400);
  const {data:payment,error:paymentError}=await sb.from('ai_subscription_payments').select('*').eq('reference',body.reference).single();
  if(paymentError||!payment)return reply({error:'Verified payment not found'},404);
  const provider=await paystackRequest(secret,'/'+body.kind+'/'+encodeURIComponent(body.provider_object_id));
  const evidence=normalizePaymentAdjustment(payment,provider,body.kind,body.provider_object_id,secret.startsWith('sk_test_')?'test':'live');
  const result=await sb.rpc('apply_ai_payment_adjustment',{p_actor:user.id,p_reason:body.reason.trim(),p_evidence:evidence});
  if(result.error)throw Error('Adjustment requires review');
  return reply(result.data);
 }catch{return reply({error:'Adjustment requires administrator review',reconciliation_required:true},409)}
});
