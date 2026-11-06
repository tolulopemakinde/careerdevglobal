import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'jsr:@supabase/supabase-js@2.117.3';
import {paystackRequest,assertProviderSubscription,providerRenewalStopped} from '../_shared/ai-billing-provider.ts';
import {billingActionAllowed} from '../_shared/ai-billing-release.ts';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Content-Type':'application/json','Cache-Control':'no-store'};
const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
function key(name:string,fallback?:string){try{return JSON.parse(Deno.env.get(name)||'{}').default??fallback}catch{return fallback}}
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(request.method!=='POST')return respond({error:'Method not allowed'},405);
 const auth=request.headers.get('Authorization');
 if(!auth?.startsWith('Bearer '))return respond({error:'Authentication required'},401);
 const url=Deno.env.get('SUPABASE_URL')!,anon=key('SUPABASE_PUBLISHABLE_KEYS',Deno.env.get('SUPABASE_ANON_KEY')),service=key('SUPABASE_SECRET_KEYS',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')),secret=Deno.env.get('PAYSTACK_SECRET_KEY');
 if(!url||!anon||!service||!secret)return respond({error:'Billing service unavailable'},503);
 try{
  const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const {data:{user},error}=await userClient.auth.getUser();
  if(error||!user)return respond({error:'Authentication required'},401);
  const {data:profile}=await userClient.from('profiles').select('role,status').eq('id',user.id).maybeSingle();
  if(profile?.status!=='active'||!['client','coach'].includes(profile.role))return respond({error:'Access denied'},403);
  let body:any;try{body=await request.json()}catch{return respond({error:'Invalid request'},400)}
  if(!['cancel','upgrade'].includes(body?.action)||body?.confirmed!==true)return respond({error:'Explicit confirmation is required'},400);
  if(body.action==='upgrade'&&(typeof body.plan_key!=='string'||!body.plan_key))return respond({error:'Target plan is required'},400);
  const admin=createClient(url,service);
  if(!await billingActionAllowed(admin,{projectUrl:url,secret,userId:user.id,action:body.action}))return respond({error:'Self-service billing is awaiting verification'},503);
  const {data:operation,error:beginError}=await admin.rpc('begin_ai_subscription_cancellation',{p_user_id:user.id,p_target_plan_key:body.action==='upgrade'?body.plan_key:null});
  if(beginError||!operation)return respond({error:'Subscription change requires billing support or another operation is pending'},409);
  const sub=operation.subscription;
  if(!sub?.paystack_subscription_code||!sub.paystack_customer_code)return respond({error:'Provider linkage requires reconciliation',reconciliation_required:true},409);
  const provider=await paystackRequest(secret,'/subscription/'+encodeURIComponent(sub.paystack_subscription_code));
  assertProviderSubscription(sub,provider);
  if(!providerRenewalStopped(provider)){
   const {data:claimed,error:claimError}=await admin.rpc('claim_ai_billing_operation',{p_operation_id:operation.id});
   if(claimError||!claimed)return respond({error:'Cancellation is pending provider reconciliation. Do not start another payment.',reconciliation_required:true},409);
   if(!provider.email_token)return respond({error:'Provider cancellation details are unavailable',reconciliation_required:true},409);
   await paystackRequest(secret,'/subscription/disable',{code:sub.paystack_subscription_code,token:provider.email_token});
   const checked=await paystackRequest(secret,'/subscription/'+encodeURIComponent(sub.paystack_subscription_code));
   assertProviderSubscription(sub,checked);
   if(!providerRenewalStopped(checked))return respond({error:'Provider cancellation is still pending',reconciliation_required:true},409);
  }
  const {data:result,error:finishError}=await admin.rpc('finish_ai_subscription_cancellation',{p_operation_id:operation.id});
  if(finishError||!result?.ok)return respond({error:'Renewals stopped at the provider; account synchronization is pending. Retry management to reconcile.',reconciliation_required:true},503);
  return respond(result);
 }catch{return respond({error:'Billing change could not be confirmed. Retry management to reconcile; contact support if it remains pending.',reconciliation_required:true},502)}
});
