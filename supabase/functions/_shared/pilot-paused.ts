import { createClient } from 'jsr:@supabase/supabase-js@2';

// Provider-dependent pipelines stay paused even when provider credentials exist.
// The 11 structured agents run through careerdev-ai-agent-runtime instead.
export function servePausedPilotPipeline(pipeline: string) {
 const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
 const reply=(body:unknown,status:number)=>new Response(JSON.stringify(body),{status,headers});
 Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers});
  if(req.method!=='POST')return reply({error:'Method not allowed'},405);
  const auth=req.headers.get('Authorization');
  if(!auth?.startsWith('Bearer '))return reply({error:'Authentication required'},401);
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_ANON_KEY')??Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  if(!url||!key)return reply({error:'Authentication unavailable'},503);
  try{
   const sb=createClient(url,key,{global:{headers:{Authorization:auth}}});
   const {data:{user},error}=await sb.auth.getUser();
   if(error||!user)return reply({error:'Invalid authentication'},401);
   const {data:profile,error:profileError}=await sb.from('profiles').select('role,status').eq('id',user.id).maybeSingle();
   if(profileError||profile?.status!=='active'||!['client','coach','staff','admin'].includes(profile.role))return reply({error:'Active account required'},403);
   return reply({error:'This AI-dependent pipeline is paused during the structured pilot.',code:'PILOT_AI_PAUSED',pipeline,structured_workspace:'/career-intelligence#pilot-agents',generated_by_ai:false},409);
  }catch{return reply({error:'Authentication unavailable'},503);}
 });
}
