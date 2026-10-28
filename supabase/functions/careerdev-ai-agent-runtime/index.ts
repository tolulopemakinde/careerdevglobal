import { buildNoAiFallback } from "./fallback.ts";
import "edge-runtime";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");


const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Content-Type":"application/json"};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
const sentryDsn = Deno.env.get("SENTRY_DSN");
const sentry = sentryDsn ? (() => { try { const u=new URL(sentryDsn); const key=u.username; const projectId=u.pathname.split("/").filter(Boolean).pop(); return key&&projectId ? {key,projectId,base:`${u.protocol}//${u.host}`} : null; } catch { return null; } })() : null;
const sentryCapture = async (event:Record<string,unknown>) => {
  if (!sentry) return;
  try {
    const envelope = [JSON.stringify({event_id:crypto.randomUUID().replaceAll("-",""),sent_at:new Date().toISOString(),dsn:sentryDsn}),JSON.stringify({type:"event"}),JSON.stringify(event),""] .join("\n");
    await fetch(`${sentry.base}/api/${sentry.projectId}/envelope/?sentry_version=7&sentry_key=${encodeURIComponent(sentry.key)}`,{method:"POST",headers:{"Content-Type":"application/x-sentry-envelope"},body:envelope});
  } catch {}
};
const sentryAgentEvent = (agent:string,requestId:string,role:string,durationMs:number,success:boolean,error?:unknown) => sentryCapture({type:success?"transaction":"error",platform:"javascript",transaction:`CareerDev AI Agent: ${agent}`,environment:"production",timestamp:Date.now()/1000,tags:{"ai.agent":agent,"ai.workflow":"careerdev-ai-agent-runtime","careerdev.role":role},contexts:{careerdev_agent:{request_id:requestId,duration_ms:durationMs,success}},...(error?{exception:{values:[{type:"CareerDevAgentRuntimeError",value:String(error)}]}}:{})});

Deno.serve(async(req)=>{
 if(req.method==='OPTIONS') return new Response('ok',{headers:cors});
 if(req.method!=='POST') return reply({error:'Method not allowed'},405);
 const runtimeStartedAt=Date.now();
 let observabilityAgent="unknown", observabilityRole="unknown", observabilityRequestId="unknown";
 try{
  const auth=req.headers.get('Authorization');
  if(!auth?.startsWith('Bearer ')) return reply({error:'Authentication required'},401);
  const sb=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:auth}}});
  const {data:{user},error:ue}=await sb.auth.getUser();
  if(ue||!user) return reply({error:'Invalid authentication'},401);
  const {data:profile}=await sb.from('profiles').select('role,status').eq('id',user.id).maybeSingle();
  if(!profile||profile.status!=='active'||!['admin','staff','coach','client'].includes(profile.role)) return reply({error:'Authorized CareerDev Global access required'},403);

  const body=await req.json();
  const requestId=body.request_id;
  observabilityRequestId=String(requestId);
  if(!requestId) return reply({error:'request_id is required'},400);

  const {data:reqRow,error:reqErr}=await sb.from('ai_agent_execution_requests').select('*').eq('id',requestId).maybeSingle();
  if(reqErr||!reqRow) return reply({error:'Execution request not found'},404);
  if(!['prepared','running'].includes(reqRow.status)) return reply({error:`Execution request is not runnable from status ${reqRow.status}`},409);
  observabilityRole=String(profile.role);
  if(['client','coach'].includes(profile.role) && reqRow.requested_by!==user.id) return reply({error:'Coach may only run own execution requests'},403);
  if(!reqRow.execution_id) return reply({error:'Execution request must be prepared first'},409);

  if(reqRow.trigger_source==='test_governed' && !['admin','staff'].includes(profile.role)) return reply({error:'Governed test executions require staff or admin access'},403);

  const {data:agentExec,error:aeErr}=await sb.from('ai_agent_executions').select('*').eq('id',reqRow.execution_id).maybeSingle();
  if(aeErr||!agentExec) return reply({error:'Agent execution not found'},404);
  const {data:agent}=await sb.from('ai_agent_registry').select('*').eq('id',agentExec.agent_id).maybeSingle();
  observabilityAgent=String(agent?.agent_key||'unknown');
  if(!agent||!agent.active) return reply({error:'AI agent is not active'},409);
  const dependencyMode=String(agent.ai_dependency_mode||'ai_required');
  if(!['works_without_ai','ai_optional'].includes(dependencyMode)) return reply({error:'Agent paused during the no-AI pilot',code:'PILOT_AGENT_PAUSED'},409);
  if(['client','coach'].includes(profile.role)){
    const {data:accessRows,error:accessErr}=await sb.rpc('get_my_ai_agent_access',{p_agent_key:agent.agent_key});
    if(accessErr) return reply({error:'AI agent subscription access could not be verified'},500);
    const access=Array.isArray(accessRows)?accessRows[0]:accessRows;
    if(!access?.allowed) return reply({error:'AI agent is not included in the active subscription for this account',agent_key:agent.agent_key},403);
  }

  const {data:snapshots,error:ssErr}=await sb.from('ai_agent_configuration_snapshots').select('*').eq('execution_id',agentExec.id);
  if(ssErr) return reply({error:'Could not load agent configuration snapshots'},500);
  const promptSnap=(snapshots||[]).find((s:any)=>s.config_type==='prompt');
  const modelSnap=(snapshots||[]).find((s:any)=>s.config_type==='model');
  const model=String(modelSnap?.configuration?.model||'gpt-5.6-luna');
  if(!promptSnap||!modelSnap) return reply({error:'Required agent configuration snapshots are missing'},409);

  let serviceExecutionId=reqRow.input_payload?.service_execution_id || null;
  let serviceExecution:any=null, step:any=null, stepRun:any=null, serviceRun:any=null;
  if(serviceExecutionId){
    const {data:e,error:eErr}=await sb.from('ai_service_workflow_executions').select('*').eq('id',serviceExecutionId).maybeSingle();
    if(eErr||!e) return reply({error:'Service workflow execution not found'},404);
    serviceExecution=e;
    const {data:r,error:rErr}=await sb.from('ai_service_delivery_runs').select('*').eq('id',e.delivery_run_id).maybeSingle();
    if(rErr||!r) return reply({error:'Service delivery run not found'},404);
    serviceRun=r;
    const {data:steps,error:stErr}=await sb.from('ai_service_workflow_steps').select('*').eq('workflow_id',e.workflow_id).eq('active',true).order('step_order');
    if(stErr||!steps?.length) return reply({error:'No active service workflow steps'},409);
    step=steps.find((s:any)=>s.step_order===e.current_step_order)||steps[0];
    const {data:sr,error:srErr}=await sb.from('ai_service_workflow_step_runs').select('*').eq('execution_id',e.id).eq('step_id',step.id).maybeSingle();
    if(srErr||!sr) return reply({error:'Service workflow step run is not prepared'},409);
    stepRun=sr;
  }

  {
    const fallback=buildNoAiFallback(agent,reqRow.input_payload||{},dependencyMode,'pilot_no_ai');
    if(serviceExecutionId&&stepRun){
      const {error:we}=await sb.rpc('record_ai_service_workflow_step_output',{p_step_run_id:stepRun.id,p_output:fallback,p_error:null});
      if(we)return reply({error:'Could not persist fallback output'},500);
      const {data:q,error:qe}=await sb.rpc('evaluate_ai_workflow_step_quality',{p_step_run_id:stepRun.id});
      if(qe){await sb.rpc('transition_ai_agent_execution',{p_request_id:reqRow.id,p_status:'awaiting_human_review',p_event_data:{stage:'fallback_quality_error',detail:qe.message}});return reply({status:'awaiting_human_review',execution_id:agentExec.id,output:fallback,quality_error:qe.message},200);}
      if(q?.passed===true){const {data:a,error:ae}=await sb.rpc('complete_ai_workflow_step_after_quality',{p_step_run_id:stepRun.id});if(!ae){await sb.rpc('transition_ai_agent_execution',{p_request_id:reqRow.id,p_status:'completed',p_event_data:{stage:'fallback_completed',quality:q}});return reply({status:a?.status||'completed',execution_id:agentExec.id,output:fallback,quality:q,advance:a},200);}}
      await sb.rpc('transition_ai_agent_execution',{p_request_id:reqRow.id,p_status:'awaiting_human_review',p_event_data:{stage:'fallback_quality_review',quality:q}});
      return reply({status:'awaiting_human_review',execution_id:agentExec.id,output:fallback,quality:q},200);
    }
    const admin=serviceRoleKey?createClient(supabaseUrl,serviceRoleKey):sb, humanReview=dependencyMode!=='works_without_ai';
    const {error:ue}=await admin.from('ai_agent_executions').update({status:humanReview?'awaiting_human_review':'completed',output_snapshot:fallback,quality_summary:{mode:fallback.fallback_mode,quality_evaluated:false},human_review_required:humanReview,human_review_status:humanReview?'pending':'not_required',completed_at:humanReview?null:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',agentExec.id);
    if(ue)return reply({error:'Could not persist no-AI agent output'},500);
    await sb.rpc('transition_ai_agent_execution',{p_request_id:reqRow.id,p_status:humanReview?'awaiting_human_review':'completed',p_event_data:{stage:'no_ai_fallback_completed',dependency_mode:dependencyMode}});
    return reply({status:humanReview?'fallback':'completed',execution_id:agentExec.id,output:fallback,human_review_required:humanReview,coach_validation_recommended:true},200);
  }

 }catch(err){ await sentryAgentEvent(observabilityAgent,observabilityRequestId,observabilityRole,Date.now()-runtimeStartedAt,false,err); return reply({error:'Unexpected runtime error',detail:String(err)},500);}
});
