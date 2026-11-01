import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.117.3";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const openaiKey = Deno.env.get("OPENAI_API_KEY");

const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Content-Type":"application/json"};
const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
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

function buildNoAiFallback(agent:any,input:any,mode:string,reason:string){
 const p=(input||{}) as Record<string,any>, profile=(p.career_profile||p.profile||{}) as Record<string,any>;
 const arr=(v:any)=>Array.isArray(v)?v:[], names=(v:any[])=>v.filter(Boolean).map(x=>typeof x==="string"?x:(x?.name||x?.title||x?.skill||x?.role||JSON.stringify(x))).slice(0,12);
 const goals=arr(p.goals||profile.goals),skills=arr(p.skills||profile.skills),gaps=arr(p.gaps||profile.gaps),roles=arr(p.target_roles||profile.target_roles);
 const targetRole=p.target_role||profile.target_role||roles[0]||null,currentRole=p.current_role||profile.current_role||null,prefs=p.preferences||profile.preferences||{};
 let summary="",recommendations:string[]=[],next_steps:string[]=[],uncertainty_flags:string[]=[],fallback_mode="deterministic_structured_baseline";
 switch(agent.agent_key){
 case"career_assessment_agent":summary=`Structured assessment. Current role: ${currentRole||"not supplied"}; target role: ${targetRole||"not supplied"}.`;recommendations=[names(skills).length?`Documented strengths: ${names(skills).join(", ")}.`:"Add documented skills.",names(gaps).length?`Documented gaps: ${names(gaps).join(", ")}.`:"Compare target requirements with evidence.",goals.length?"Align with stated goals.":"Capture explicit goals."];next_steps=["Review consequential decisions with a CareerDev Global Coach."];break;
 case"skills_gaps_agent":summary=`Structured skills/gaps map for ${targetRole||"the stated target"}.`;recommendations=[names(skills).length?`Skills: ${names(skills).join(", ")}.`:"No structured skills supplied.",names(gaps).length?`Gaps: ${names(gaps).join(", ")}.`:"No explicit gaps supplied.",targetRole?`Map ${targetRole} requirements to verified evidence.`:"Specify a target role."];next_steps=["Add evidence for unverified skill or qualification claims."];break;
 case"learning_development_agent":summary="Structured learning/development baseline from supplied goals, skills and gaps.";recommendations=names(gaps).length?names(gaps).map(g=>`Prioritize learning or practice related to: ${g}.`):["Create a target-role gap map before selecting learning priorities."];next_steps=["Convert priority gaps into measurable development actions."];break;
 case"talent_mobility_agent":summary="Structured talent-mobility baseline from supplied career context.";recommendations=[targetRole?`Position transferable evidence toward ${targetRole}.`:"Specify the target role.","Separate documented evidence from assumptions about portability.","Verify country-specific requirements from authoritative sources before acting."];next_steps=["Validate work-authorization, licensing and regulatory requirements before consequential mobility decisions."];uncertainty_flags=["No independent immigration/licensing/regulatory verification was performed."];break;
 case"ethics_quality_assurance_agent":summary="Deterministic evidence and quality-control baseline.";recommendations=["Keep claims traceable to supplied evidence.","Flag missing or unverified information.","Do not present unverified recommendations as verified facts."];next_steps=["Route material uncertainty or consequential outputs for human review."];break;
 case"career_discovery_agent":summary="Structured career-direction baseline from explicit goals, preferences and stated roles.";recommendations=names(roles).length?names(roles).map(r=>`Consider ${r} as a stated target and validate fit against evidence.`):["Capture preferred roles, interests and constraints."];next_steps=["Validate directions against evidence and current requirements."];fallback_mode="structured_baseline";break;
 case"career_coach_agent":summary="Structured coaching baseline from stated goals.";recommendations=goals.length?goals.map(g=>`Turn the stated goal into an observable action: ${typeof g==="string"?g:JSON.stringify(g)}.`):["Define one clear career goal and next action."];next_steps=["Review progress and barriers with a coach when accountability is desired."];fallback_mode="structured_baseline";break;
 case"job_search_intelligence_agent":summary=`Structured job-search baseline for ${targetRole||"the stated target"}.`;recommendations=[targetRole?`Prioritize roles matching ${targetRole}.`:"Specify target roles.",prefs.location?`Apply location preference: ${JSON.stringify(prefs.location)}.`:"Capture location/work-mode preferences.","Do not treat an opportunity as current without a live-source check."];next_steps=["Provide current opportunity data before live-market claims."];uncertainty_flags=["No live opportunity search was performed."];fallback_mode="structured_baseline";break;
 case"academic_career_transition_agent":summary="Structured education-to-work transition baseline.";recommendations=["Use documented education and experience in the transition evidence map.",targetRole?`Identify transition actions toward ${targetRole}.`:"Specify the target role.","Validate gaps before selecting transition actions."];next_steps=["Build and validate a target-role evidence map."];fallback_mode="structured_baseline";break;
 case"employer_talent_agent":summary="Structured employer/talent baseline from supplied context.";recommendations=[targetRole?`Use ${targetRole} as the supplied role context.`:"Supply a role/workforce question.",names(skills).length?`Consider supplied skills: ${names(skills).join(", ")}.`:"Capture required and evidenced skills.","Do not infer suitability beyond supplied evidence."];next_steps=["Validate requirements and evidence before consequential decisions."];fallback_mode="structured_baseline";break;
 case"career_research_agent":summary="Structured career-research baseline from supplied questions and profile context.";recommendations=["Separate known facts from questions requiring external research.","Record source references for verified findings.","Do not claim current market or opportunity information without a live source."];next_steps=["Run source-based research when current external information is required."];uncertainty_flags=["No live external research was performed."];fallback_mode="structured_baseline";break;
 default:summary=`AI unavailable; structured baseline preserved for ${agent.name}.`;recommendations=["Preserve supplied context and resume AI enhancement when provider access is restored."];next_steps=["Restore AI access if AI-specific generation is required."];
 }
 return{summary,recommendations,next_steps,uncertainty_flags,source_refs:Array.isArray(p.source_refs)?p.source_refs:["career-intelligence-profile"],fact_classifications:["supplied_context"],unsupported_claims:0,no_fabrication:1,source_traceability:.5,verification_gate:false,unverified_applied:1,decision_status:"baseline_only",human_review_required:mode!=="works_without_ai",human_review_gate:mode!=="works_without_ai",human_approved:false,generated_by_ai:false,fallback:true,fallback_mode,dependency_mode:mode,ai_unavailable:true,reason,agent_key:agent.agent_key,coach_validation_recommended:true,input_preserved:p};
}
function extractOutputText(j:any){
  const txt=j?.output?.flatMap((o:any)=>o.content||[]).find((c:any)=>c.type==='output_text')?.text;
  if(txt) return txt;
  if(j?.output_parsed) return JSON.stringify(j.output_parsed);
  return null;
}

Deno.serve(async(req)=>{
 if(req.method==='OPTIONS') return new Response('ok',{headers:cors});
 const runtimeStartedAt=Date.now();
 let observabilityAgent="unknown", observabilityRole="unknown", observabilityRequestId="unknown";
 let creditLedger:string|null=null,creditUser:string|null=null,creditSettled=false,providerGenerated=false,creditMetadata:Record<string,unknown>={};
 const creditAdmin=serviceRoleKey?createClient(supabaseUrl,serviceRoleKey):null;
 const settle=async(outcome:string)=>{
   if(!creditLedger||creditSettled)return true;
   const result=await creditAdmin!.rpc('settle_ai_credit_charge',{p_ledger_id:creditLedger,p_user_id:creditUser,p_outcome:outcome,p_metadata:creditMetadata});
   if(result.error||result.data?.status!==outcome)return false;
   creditSettled=true;return true;
 };
 const reply=async(body:unknown,status=200)=>{
   if(creditLedger&&!await settle(status<400&&providerGenerated?'consumed':'released'))return respond({error:'Credit settlement requires reconciliation'},503);
   return respond(body,status);
 };
 try{
  const auth=req.headers.get('Authorization');
  if(!auth?.startsWith('Bearer ')) return await reply({error:'Authentication required'},401);
  const sb=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:auth}}});
  const {data:{user},error:ue}=await sb.auth.getUser();
  if(ue||!user) return await reply({error:'Invalid authentication'},401);
  const {data:profile}=await sb.from('profiles').select('role,status').eq('id',user.id).maybeSingle();
  if(!profile||profile.status!=='active'||!['admin','staff','coach','client'].includes(profile.role)) return await reply({error:'Authorized CareerDev Global access required'},403);

  const body=await req.json();
  const requestId=body.request_id;
  observabilityRequestId=String(requestId);
  if(!requestId) return await reply({error:'request_id is required'},400);

  const {data:reqRow,error:reqErr}=await sb.from('ai_agent_execution_requests').select('*').eq('id',requestId).maybeSingle();
  if(reqErr||!reqRow) return await reply({error:'Execution request not found'},404);
  if(!['prepared','running'].includes(reqRow.status)) return await reply({error:`Execution request is not runnable from status ${reqRow.status}`},409);
  observabilityRole=String(profile.role);
  if(['client','coach'].includes(profile.role) && reqRow.requested_by!==user.id) return await reply({error:'Coach may only run own execution requests'},403);
  if(!reqRow.execution_id) return await reply({error:'Execution request must be prepared first'},409);

  if(reqRow.trigger_source==='test_governed' && !['admin','staff'].includes(profile.role)) return await reply({error:'Governed test executions require staff or admin access'},403);

  const {data:agentExec,error:aeErr}=await sb.from('ai_agent_executions').select('*').eq('id',reqRow.execution_id).maybeSingle();
  if(aeErr||!agentExec) return await reply({error:'Agent execution not found'},404);
  const {data:agent}=await sb.from('ai_agent_registry').select('*').eq('id',agentExec.agent_id).maybeSingle();
  observabilityAgent=String(agent?.agent_key||'unknown');
  if(!agent||!agent.active) return await reply({error:'AI agent is not active'},409);
  const dependencyMode=String(agent.ai_dependency_mode||'ai_required');
  if(['client','coach'].includes(profile.role)){
    const {data:accessRows,error:accessErr}=await sb.rpc('get_my_ai_agent_access',{p_agent_key:agent.agent_key});
    if(accessErr) return await reply({error:'AI agent subscription access could not be verified'},500);
    const access=Array.isArray(accessRows)?accessRows[0]:accessRows;
    if(!access?.allowed) return await reply({error:'AI agent is not included in the active subscription for this account',agent_key:agent.agent_key},403);
  }

  const {data:snapshots,error:ssErr}=await sb.from('ai_agent_configuration_snapshots').select('*').eq('execution_id',agentExec.id);
  if(ssErr) return await reply({error:'Could not load agent configuration snapshots'},500);
  const promptSnap=(snapshots||[]).find((s:any)=>s.config_type==='prompt');
  const modelSnap=(snapshots||[]).find((s:any)=>s.config_type==='model');
  const model=String(modelSnap?.configuration?.model||'gpt-5.6-luna');
  let creditReservation:any=null;
  if(dependencyMode!=='works_without_ai' && openaiKey){
    if(!creditAdmin)return await reply({error:'Credit service unavailable'},503);
    const {data:creditRows,error:creditErr}=await sb.rpc('reserve_ai_credits',{p_operation_key:agent.agent_key,p_execution_id:agentExec.id,p_request_id:reqRow.id,p_idempotency_key:`agent-runtime:${agentExec.id}`,p_metadata:{agent_key:agent.agent_key,workflow:'careerdev-ai-agent-runtime',trigger_source:reqRow.trigger_source}});
    if(creditErr) return await reply({error:'AI credit authorization failed',detail:creditErr.message},500);
    const credit=Array.isArray(creditRows)?creditRows[0]:creditRows;
    if(!credit?.allowed) return await reply({error:'AI credit allowance exhausted',code:'AI_CREDITS_EXHAUSTED',reason:credit?.reason||'insufficient_ai_credits',credits_remaining:credit?.credits_remaining??0,credits_required:credit?.credits_required??0,monthly_allowance:credit?.monthly_allowance??0,plan_key:credit?.plan_key||null},402);
    creditReservation=credit;
    if(credit.ledger_id){
      const claim=await creditAdmin!.rpc('claim_ai_runtime_credit',{p_ledger_id:credit.ledger_id,p_user_id:user.id});
      if(claim.error||claim.data!==true)return await reply({error:'This execution is already running or requires reconciliation'},409);
      creditLedger=credit.ledger_id;creditUser=user.id;
    }
  }
  if(!promptSnap||!modelSnap) return await reply({error:'Required agent configuration snapshots are missing'},409);

  let serviceExecutionId=reqRow.input_payload?.service_execution_id || null;
  let serviceExecution:any=null, step:any=null, stepRun:any=null, serviceRun:any=null;
  if(serviceExecutionId){
    const {data:e,error:eErr}=await sb.from('ai_service_workflow_executions').select('*').eq('id',serviceExecutionId).maybeSingle();
    if(eErr||!e) return await reply({error:'Service workflow execution not found'},404);
    serviceExecution=e;
    const {data:r,error:rErr}=await sb.from('ai_service_delivery_runs').select('*').eq('id',e.delivery_run_id).maybeSingle();
    if(rErr||!r) return await reply({error:'Service delivery run not found'},404);
    serviceRun=r;
    const {data:steps,error:stErr}=await sb.from('ai_service_workflow_steps').select('*').eq('workflow_id',e.workflow_id).eq('active',true).order('step_order');
    if(stErr||!steps?.length) return await reply({error:'No active service workflow steps'},409);
    step=steps.find((s:any)=>s.step_order===e.current_step_order)||steps[0];
    const {data:sr,error:srErr}=await sb.from('ai_service_workflow_step_runs').select('*').eq('execution_id',e.id).eq('step_id',step.id).maybeSingle();
    if(srErr||!sr) return await reply({error:'Service workflow step run is not prepared'},409);
    stepRun=sr;
  }

  if(!openaiKey || dependencyMode==='works_without_ai'){
    const fallback=buildNoAiFallback(agent,reqRow.input_payload||{},dependencyMode,openaiKey?'ai_optional_structured_baseline':'ai_provider_unavailable');
    if(serviceExecutionId&&stepRun){
      const {error:we}=await sb.rpc('record_ai_service_workflow_step_output',{p_step_run_id:stepRun.id,p_output:fallback,p_error:null});
      if(we)return await reply({error:'Could not persist fallback output'},500);
      const {data:q,error:qe}=await sb.rpc('evaluate_ai_workflow_step_quality',{p_step_run_id:stepRun.id});
      if(qe){await sb.rpc('transition_ai_agent_execution',{p_request_id:reqRow.id,p_status:'awaiting_human_review',p_event_data:{stage:'fallback_quality_error',detail:qe.message}});return await reply({status:'awaiting_human_review',execution_id:agentExec.id,output:fallback,quality_error:qe.message},200);}
      if(q?.passed===true){const {data:a,error:ae}=await sb.rpc('complete_ai_workflow_step_after_quality',{p_step_run_id:stepRun.id});if(!ae){await sb.rpc('transition_ai_agent_execution',{p_request_id:reqRow.id,p_status:'completed',p_event_data:{stage:'fallback_completed',quality:q}});return await reply({status:a?.status||'completed',execution_id:agentExec.id,output:fallback,quality:q,advance:a},200);}}
      await sb.rpc('transition_ai_agent_execution',{p_request_id:reqRow.id,p_status:'awaiting_human_review',p_event_data:{stage:'fallback_quality_review',quality:q}});
      return await reply({status:'awaiting_human_review',execution_id:agentExec.id,output:fallback,quality:q},200);
    }
    const admin=serviceRoleKey?createClient(supabaseUrl,serviceRoleKey):sb, humanReview=dependencyMode!=='works_without_ai';
    const {error:ue}=await admin.from('ai_agent_executions').update({status:humanReview?'awaiting_human_review':'completed',output_snapshot:fallback,quality_summary:{mode:fallback.fallback_mode,quality_evaluated:false},human_review_required:humanReview,human_review_status:humanReview?'pending':'not_required',completed_at:humanReview?null:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',agentExec.id);
    if(ue)return await reply({error:'Could not persist no-AI agent output'},500);
    await sb.rpc('transition_ai_agent_execution',{p_request_id:reqRow.id,p_status:humanReview?'awaiting_human_review':'completed',p_event_data:{stage:'no_ai_fallback_completed',dependency_mode:dependencyMode}});
    return await reply({status:humanReview?'fallback':'completed',execution_id:agentExec.id,output:fallback,human_review_required:humanReview,coach_validation_recommended:true},200);
  }

  const inputContext={
    agent:{key:agent.agent_key,name:agent.name,category:agent.agent_category,autonomy_level:agent.autonomy_level},
    workflow:reqRow.workflow_id ? {id:reqRow.workflow_id} : null,
    request:{id:reqRow.id,trigger_source:reqRow.trigger_source,input:reqRow.input_payload},
    service_execution:serviceExecution ? {id:serviceExecution.id,context:serviceExecution.context_snapshot} : null,
    service_run:serviceRun ? {id:serviceRun.id,service_request_id:serviceRun.service_request_id,service_id:serviceRun.service_id,blueprint_id:serviceRun.blueprint_id} : null,
    step:step ? {order:step.step_order,key:step.step_key,name:step.step_name,purpose:step.purpose,input_mapping:step.input_mapping,output_schema:step.output_schema,quality_gate_criteria:step.quality_gate_criteria} : null,
    previous_output:serviceExecution ? serviceExecution.output_snapshot : null,
    caller:{user_id:user.id,role:profile.role}
  };

  const governedPrompt=promptSnap.configuration||{};
  const system=`You are a governed CareerDev Global AI agent. Role: ${governedPrompt.role||agent.name}. Rules: ${JSON.stringify(governedPrompt.rules||governedPrompt.operating_rules||[])}. Execute only the requested workflow. Use only supplied context. Never fabricate client facts, achievements, dates, employers, qualifications, metrics, outcomes, or evidence. Preserve provenance and flag uncertainty. Outputs are drafts, analyses, recommendations, or decision-support unless the requested task explicitly performs a consequential external action. Do not claim that human approval, external verification, or evidence verification has occurred unless it is explicitly present in the supplied context. NEVER guess, infer missing facts, fabricate details, or fill an information gap with a plausible assumption. Every material factual claim must be either (a) directly supported by supplied user/client evidence, or (b) supported by a current authoritative external source obtained through the web-search tool when current/external information is required. When current, changing, public, market, employer, job, academic, regulatory, immigration, licensing, salary, opportunity, policy, or other external information is requested, use web search and prefer authoritative primary sources; do not rely on memory. Record source URLs/titles in source_refs when external sources are used. If the web-search tool is unavailable, fails, or no sufficiently reliable source can be found, STOP the unsupported claim and ask the user for the missing information or state that verification is required before proceeding. Do not manufacture a substitute answer. If supplied evidence or source status is unverified, set verification_gate=false and explicitly flag the evidence as unverified. Never convert an unverified source into a verified result. Distinguish facts, user-provided claims, sourced findings, professional judgment, assumptions, and recommendations. For ordinary informational or drafting tasks, human_approved=false and human_review_gate=false. Human review remains recommended before a consequential external action, publication, submission, or client-facing professional use. Return ONLY JSON matching the supplied schema.`;
  const schema=step?.output_schema || reqRow.input_payload?.output_schema || {type:'object',additionalProperties:true};
  const userPrompt=`Execute the authorized CareerDev Global AI task.\\n\\nCONTEXT:\\n${JSON.stringify(inputContext)}\\n\\nOUTPUT SCHEMA:\\n${JSON.stringify(schema)}\\n\\nQUALITY CRITERIA:\\n${JSON.stringify(step?.quality_gate_criteria||{})}`;

  await sb.rpc('transition_ai_agent_execution',{p_request_id:reqRow.id,p_status:'running',p_event_data:{stage:'ai_processing'}});
  const provider=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${openaiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model,input:[{role:'system',content:[{type:'input_text',text:system}]},{role:'user',content:[{type:'input_text',text:userPrompt}]}],tools:[{type:'web_search'}],text:{format:{type:'json_schema',name:'careerdev_agent_output',strict:true,schema}}})});
  const raw=await provider.text();
  if(!provider.ok){
    creditMetadata={provider_status:provider.status,credit_release_reason:'provider_request_failed'};
    let billingCode='';
    try{billingCode=String(JSON.parse(raw)?.error?.code||'')}catch{}
    const billingFailure=provider.status===429 && ['credit_balance_exhausted','organization_spend_limit_exceeded','project_spend_limit_exceeded','organization_usage_limit_exceeded'].includes(billingCode);
    if(billingFailure){
      const fallback={status:'ai_unavailable',generated_by_ai:false,fallback:true,agent_key:agent.agent_key,dependency_mode:dependencyMode,reason:billingCode,human_review_required:true,coach_validation_recommended:true,input_preserved:reqRow.input_payload||null,next_action:dependencyMode==='works_without_ai'?'continue_with_deterministic_baseline':dependencyMode==='ai_optional'?'continue_with_structured_baseline_and_queue_ai_enhancement':'restore_api_access_and_resume'};
      await sb.rpc('transition_ai_agent_execution',{p_request_id:reqRow.id,p_status:'failed',p_event_data:{stage:'ai_unavailable_fallback',reason:billingCode,dependency_mode:dependencyMode}});
      if(dependencyMode!=='ai_required' && serviceExecutionId && stepRun){
        await sb.rpc('record_ai_service_workflow_step_output',{p_step_run_id:stepRun.id,p_output:fallback,p_error:'AI credits/spend unavailable; fallback returned'});
      }
      return await reply({status:dependencyMode==='ai_required'?'blocked':'fallback',execution_id:agentExec.id,output:fallback,ai_unavailable:true,dependency_mode:dependencyMode},dependencyMode==='ai_required'?409:200);
    }
    await sb.rpc('transition_ai_agent_execution',{p_request_id:reqRow.id,p_status:'failed',p_event_data:{stage:'provider_error',provider_status:provider.status}});
    return await reply({error:'AI provider request failed',provider_status:provider.status},502);
  }
  const providerJson=JSON.parse(raw);
  const usage=providerJson?.usage||{};
  const inputTokens=Number(usage?.input_tokens||0), outputTokens=Number(usage?.output_tokens||0), totalTokens=Number(usage?.total_tokens||inputTokens+outputTokens);
  creditMetadata={provider:'openai',model,input_tokens:inputTokens,output_tokens:outputTokens,total_tokens:totalTokens};
  if(serviceRoleKey){
    const adminUsage=createClient(supabaseUrl,serviceRoleKey);
    await adminUsage.from('ai_usage_events').insert({run_id:agentExec.id,request_id:serviceExecutionId||null,client_id:serviceRun?.client_id||null,service_scope:'career_intelligence',workflow:'careerdev-ai-agent-runtime',provider:'openai',model_name:model,input_tokens:inputTokens,output_tokens:outputTokens,total_tokens:totalTokens,estimated_cost_usd:0,metadata:{agent_key:agent.agent_key,credit_ledger_id:creditReservation?.ledger_id||null,credit_cost:creditReservation?.credits_required||0,response_id:providerJson?.id||null}});
  }
  let output:any;
  try{
    const j=providerJson;
    const text=extractOutputText(j);
    output=text?JSON.parse(text):j.output_parsed||j.output||j;
    const webSources:any[]=[];
    for(const item of (j.output||[])){
      for(const c of (item.content||[])){
        for(const a of (c.annotations||[])){
          if(a?.type==='url_citation' && a.url) webSources.push({url:a.url,title:a.title||null});
        }
      }
    }
    if(webSources.length){
      output.source_refs=[...(Array.isArray(output.source_refs)?output.source_refs:[]),...webSources];
      output.external_verification_used=true;
      output.external_source_count=webSources.length;
    }
    if(output.unsupported_claims>0 || output.unverified_applied>0){
      output.verification_gate=false;
      output.human_review_required=true;
    }
  }catch{await sb.rpc('transition_ai_agent_execution',{p_request_id:reqRow.id,p_status:'failed',p_event_data:{stage:'parse_error'}}); return await reply({error:'AI output could not be parsed as governed JSON'},502);}

  providerGenerated=true;
  if(reqRow.trigger_source==='test_governed'){
    const {data:testFinal,error:testErr}=await sb.rpc('finalize_ai_governed_test_run',{p_request_id:reqRow.id,p_output_snapshot:output});
    if(testErr){
      await sb.rpc('transition_ai_agent_execution',{p_request_id:reqRow.id,p_status:'failed',p_event_data:{stage:'test_governance_error',detail:testErr.message}});
      return await reply({error:'Governed test result could not be evaluated',detail:testErr.message},500);
    }
    await sb.from('ai_agent_executions').update({status:'awaiting_human_review',output_snapshot:output,quality_summary:testFinal?.evaluation||{},human_review_required:true,human_review_status:'pending',updated_at:new Date().toISOString()}).eq('id',agentExec.id);
    await sb.rpc('transition_ai_agent_execution',{p_request_id:reqRow.id,p_status:'awaiting_human_review',p_event_data:{stage:'test_quality_evaluated',evaluation:testFinal?.evaluation||null}});
    return await reply({status:'awaiting_human_review',execution_id:agentExec.id,test_run_id:testFinal?.test_run_id||null,evaluation:testFinal?.evaluation||null,output},200);
  }

  if(serviceExecutionId){
    const {error:writeErr}=await sb.rpc('record_ai_service_workflow_step_output',{p_step_run_id:stepRun.id,p_output:output,p_error:null});
    if(writeErr){await sb.rpc('transition_ai_agent_execution',{p_request_id:reqRow.id,p_status:'failed',p_event_data:{stage:'persist_error',detail:writeErr.message}});return await reply({error:'Could not persist AI step output'},500);}
    const {data:quality,error:qErr}=await sb.rpc('evaluate_ai_workflow_step_quality',{p_step_run_id:stepRun.id});
    await sb.rpc('transition_ai_agent_execution',{p_request_id:reqRow.id,p_status:qErr?'failed':((quality?.passed===true)?'completed':'awaiting_human_review'),p_event_data:{stage:'quality_evaluated',quality:quality||null,error:qErr?.message||null}});
    if(qErr) return await reply({error:'Quality evaluation failed',detail:qErr.message},500);
    if(quality?.critical_failure) return await reply({status:'blocked',execution_id:agentExec.id,service_execution_id:serviceExecutionId,quality},409);
    if(quality?.passed!==true) return await reply({status:'awaiting_human_review',execution_id:agentExec.id,service_execution_id:serviceExecutionId,quality,output},200);
    const {data:advance,error:aErr}=await sb.rpc('complete_ai_workflow_step_after_quality',{p_step_run_id:stepRun.id});
    if(aErr) return await reply({error:'Quality passed but workflow could not advance',detail:aErr.message},500);
    return await reply({status:advance?.status||'completed',execution_id:agentExec.id,service_execution_id:serviceExecutionId,quality,advance,output},200);
  }

  if(!serviceRoleKey) return await reply({error:'Credit service unavailable'},500);
  const adminSb=createClient(supabaseUrl,serviceRoleKey);
  const {error:updateErr}=await adminSb.from('ai_agent_executions').update({status:'completed',output_snapshot:output,quality_summary:{mode:'autonomous_draft_runtime',quality_evaluated:false},human_review_required:false,human_review_status:'not_required',completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',agentExec.id);
  if(updateErr) return await reply({error:'Could not persist agent output'},500);
  await sb.rpc('transition_ai_agent_execution',{p_request_id:reqRow.id,p_status:'completed',p_event_data:{stage:'output_persisted',quality_evaluated:false,human_review_required:false}});
  await sentryAgentEvent(observabilityAgent,observabilityRequestId,observabilityRole,Date.now()-runtimeStartedAt,true);
  return await reply({status:'completed',execution_id:agentExec.id,output,human_review_required:false,coach_validation_recommended:profile.role==='client'},200);
 }catch(err){ await sentryAgentEvent(observabilityAgent,observabilityRequestId,observabilityRole,Date.now()-runtimeStartedAt,false,err); return await reply({error:'Unexpected runtime error',detail:String(err)},500);}
 finally{if(creditLedger&&!creditSettled)await settle('released');}
});
