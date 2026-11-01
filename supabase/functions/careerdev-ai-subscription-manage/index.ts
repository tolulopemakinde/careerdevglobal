import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Content-Type":"application/json"};
const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
function key(name:string, fallback?:string){const raw=Deno.env.get(name);if(!raw)return fallback;try{return JSON.parse(raw).default??fallback}catch{return fallback}}
Deno.serve(async request=>{
 if(request.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(request.method!=="POST")return respond({error:"Method not allowed"},405);
 const url=Deno.env.get("SUPABASE_URL"),anon=key("SUPABASE_PUBLISHABLE_KEYS",Deno.env.get("SUPABASE_ANON_KEY")??Deno.env.get("SUPABASE_PUBLISHABLE_KEY")),secret=key("SUPABASE_SECRET_KEYS",Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")),paystack=Deno.env.get("PAYSTACK_SECRET_KEY");
 if(!url||!anon||!secret||!paystack)return respond({error:"Billing service unavailable"},503);
 const auth=request.headers.get("Authorization");
 if(!auth?.startsWith("Bearer "))return respond({error:"Authentication required"},401);
 const client=createClient(url,anon,{global:{headers:{Authorization:auth}}});
 const {data:{user},error:userError}=await client.auth.getUser();
 if(userError||!user)return respond({error:"Authentication required"},401);
 const {data:profile}=await client.from("profiles").select("role,status").eq("id",user.id).maybeSingle();
 if(!profile||profile.status!=="active"||!["client","coach"].includes(profile.role))return respond({error:"Access denied"},403);
 let body:unknown;try{body=await request.json()}catch{return respond({error:"Invalid request"},400)}
 if(!body||typeof body!=="object"||!("action" in body)||(body as {action:unknown}).action!=="cancel")return respond({error:"Unsupported action"},400);
 const admin=createClient(url,secret);
 const {data:subscriptions,error:readError}=await admin.from("ai_agent_subscriptions").select("id,status,paystack_subscription_code,current_period_end").eq("user_id",user.id).in("status",["active","non_renewing"]).order("created_at",{ascending:false}).limit(2);
 if(readError)return respond({error:"Unable to retrieve subscription"},503);
 if(!subscriptions?.length)return respond({error:"No active subscription"},404);
 if(subscriptions.length!==1)return respond({error:"Multiple subscriptions require billing support"},409);
 const sub=subscriptions[0];
 if(sub.status==="non_renewing")return respond({ok:true,status:"non_renewing"});
 if(!sub.paystack_subscription_code)return respond({error:"Provider subscription is not yet linked; contact billing support"},409);
 const headers={Authorization:"Bearer "+paystack,"Content-Type":"application/json"};
 try{
  const lookup=await fetch("https://api.paystack.co/subscription/"+encodeURIComponent(sub.paystack_subscription_code),{headers});
  const found=await lookup.json();
  if(!lookup.ok||!found?.status||!found?.data?.email_token)return respond({error:"Could not verify Paystack subscription details"},502);
  const disable=await fetch("https://api.paystack.co/subscription/disable",{method:"POST",headers,body:JSON.stringify({code:sub.paystack_subscription_code,token:found.data.email_token})});
  const result=await disable.json();
  if(!disable.ok||!result?.status)return respond({error:"Paystack did not confirm cancellation"},502);
  const {error:updateError}=await admin.from("ai_agent_subscriptions").update({status:"non_renewing"}).eq("id",sub.id).eq("user_id",user.id).eq("status","active");
  if(updateError)return respond({error:"Paystack stopped renewals, but account synchronization needs support. Do not retry payment."},503);
  return respond({ok:true,status:"non_renewing",current_period_end:sub.current_period_end});
 }catch{return respond({error:"Billing provider temporarily unavailable"},502)}
});
