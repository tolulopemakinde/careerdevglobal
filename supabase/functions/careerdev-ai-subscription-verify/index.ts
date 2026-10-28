import { validPilotPayment } from "../_shared/pilot-billing.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const url=Deno.env.get("SUPABASE_URL")!;
const anon=Deno.env.get("SUPABASE_ANON_KEY")??Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const secret=Deno.env.get("PAYSTACK_SECRET_KEY");
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Content-Type":"application/json"};
const reply=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:cors});
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return reply({error:"Method not allowed"},405);
 try{
  if(!service||!secret)return reply({error:"Payment provider credentials are not configured"},503);
  const auth=req.headers.get("Authorization");if(!auth?.startsWith("Bearer "))return reply({error:"Authentication required"},401);
  const uc=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const {data:{user},error:ue}=await uc.auth.getUser();if(ue||!user)return reply({error:"Invalid authentication"},401);
  const body=await req.json();const reference=String(body?.reference??"").trim();if(!reference)return reply({error:"reference is required"},400);
  const sb=createClient(url,service);
  const {data:sub}=await sb.from("ai_agent_subscriptions").select("*").eq("paystack_transaction_reference",reference).eq("user_id",user.id).maybeSingle();
  if(!sub)return reply({error:"Subscription payment record not found"},404);
  const r=await fetch("https://api.paystack.co/transaction/verify/"+encodeURIComponent(reference),{headers:{Authorization:"Bearer "+secret}});
  const result=await r.json().catch(()=>({}));
  if(!r.ok||!result?.status||result?.data?.status!=="success")return reply({error:"Payment has not been verified as successful",detail:result?.message??result?.data?.status??"pending"},409);
  if(!validPilotPayment(sub,result.data))return reply({error:"Payment does not match an eligible pilot subscription"},409);
  const paidAt=result.data?.paid_at?new Date(result.data.paid_at):new Date();
  const end=new Date(paidAt);
  if(sub.billing_interval==="monthly")end.setMonth(end.getMonth()+1);else end.setFullYear(end.getFullYear()+1);
  const subscriptionCode=String(result.data?.subscription?.subscription_code??result.data?.subscription_code??"").trim()||null;
  const customerCode=String(result.data?.customer?.customer_code??"").trim()||null;
  const {data:updated,error:updateError}=await sb.from("ai_agent_subscriptions").update({status:"active",paystack_subscription_code:subscriptionCode,paystack_customer_code:customerCode,current_period_start:paidAt.toISOString(),current_period_end:end.toISOString(),metadata:{...(sub.metadata||{}),verified_by:"careerdev-ai-subscription-verify",paystack_status:result.data?.status}}).eq("id",sub.id).eq("status",sub.status).select("id").maybeSingle();
  if(updateError||!updated)return reply({error:"Subscription changed or could not be activated"},409);
  return reply({status:"active",subscription_id:sub.id,plan_key:sub.plan_key,billing_interval:sub.billing_interval,current_period_end:end.toISOString()});
 }catch(err){return reply({error:"Subscription verification failed",detail:String(err)},500)}
});
