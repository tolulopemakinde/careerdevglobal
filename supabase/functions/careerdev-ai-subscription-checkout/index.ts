import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'jsr:@supabase/supabase-js@2.117.3';
import {paystackRequest,providerPlanCode} from '../_shared/ai-billing-provider.ts';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Content-Type':'application/json','Cache-Control':'no-store'};
const reply=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers});
function key(name:string,fallback?:string){try{return JSON.parse(Deno.env.get(name)||'{}').default??fallback}catch{return fallback}}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 const auth=req.headers.get('Authorization');if(!auth?.startsWith('Bearer '))return reply({error:'Authentication required'},401);
 const url=Deno.env.get('SUPABASE_URL')!,anon=key('SUPABASE_PUBLISHABLE_KEYS',Deno.env.get('SUPABASE_ANON_KEY')),service=key('SUPABASE_SECRET_KEYS',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')),secret=Deno.env.get('PAYSTACK_SECRET_KEY');
 if(!url||!anon||!service||!secret)return reply({error:'Billing unavailable'},503);
 let stage='authentication';
 try{
  const client=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const {data:{user},error}=await client.auth.getUser();if(error||!user?.email)return reply({error:'Authentication required'},401);
  const body=await req.json(),sb=createClient(url,service);
  const gate=await sb.from('ai_billing_release_config').select('self_service_enabled').eq('id',true).maybeSingle();
  if(gate.error||gate.data?.self_service_enabled!==true)return reply({error:'Self-service billing is awaiting verification'},503);
  const {data:op,error:prepareError}=await sb.rpc('prepare_ai_subscription_checkout',{p_user_id:user.id,p_plan_key:body.plan_key,p_billing_interval:body.billing_interval,p_currency:body.currency});
  if(prepareError||!op)return reply({error:'Checkout is unavailable. Manage your existing subscription or contact support about a pending payment.'},409);
  if(op.response?.authorization_url)return reply(op.response);
  const sub=op.subscription;
  stage='provider_plan';
  const plan=await paystackRequest(secret,'/plan/'+encodeURIComponent(sub.paystack_plan_code));
  if(providerPlanCode(plan)!==sub.paystack_plan_code||plan.currency!==sub.currency||Number(plan.amount)!==Math.round(Number(sub.amount)*100)||plan.interval!==(sub.billing_interval==='annual'?'annually':'monthly'))return reply({error:'Provider plan differs from approved pricing; contact support'},409);
  const {data:claim,error:claimError}=await sb.rpc('claim_ai_billing_operation',{p_operation_id:op.id});
  if(claimError||!claim)return reply({error:'Checkout initialization is pending reconciliation. Do not start another payment.'},409);
  stage='callback_configuration';
  const app=Deno.env.get('CAREERDEV_APP_URL');
  if(!app||new URL(app).protocol!=='https:')return reply({error:'Billing callback configuration is unavailable'},503);
  stage='provider_initialize';
  const data=await paystackRequest(secret,'/transaction/initialize',{email:user.email,amount:String(Math.round(Number(sub.amount)*100)),currency:sub.currency,reference:sub.paystack_transaction_reference,plan:sub.paystack_plan_code,
   callback_url:new URL('/pricing?payment=return&reference='+encodeURIComponent(sub.paystack_transaction_reference),app).href,
   metadata:{careerdev_ai_subscription_id:sub.id,plan_key:sub.plan_key,billing_interval:sub.billing_interval}});
  stage='provider_response';
  if(typeof data?.authorization_url!=='string'||new URL(data.authorization_url).origin!=='https://checkout.paystack.com'||data.reference!==sub.paystack_transaction_reference)throw new Error('Unverified checkout response');
  const result={status:'checkout_ready',authorization_url:data.authorization_url,reference:sub.paystack_transaction_reference,amount:sub.amount,currency:sub.currency};
  const saved=await sb.from('ai_billing_operations').update({response:result,updated_at:new Date().toISOString()}).eq('id',op.id).eq('status','provider_requested');
  if(saved.error)return reply({error:'Checkout response synchronization is pending; contact support'},503);
  return reply(result);
 }catch(error){return reply({error:'Checkout could not be confirmed. Contact support about a pending checkout before retrying payment.',error_code:stage+(error instanceof Error&&/^provider_[0-9]{3}_[a-z]+$/.test(error.message)?':'+error.message:'')},502)}
});
