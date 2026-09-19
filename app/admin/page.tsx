'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createSupabaseBrowserClient } from '../../lib/supabase-browser';

type AnyRow=Record<string,any>;
type Ops=Record<string,AnyRow[]>;
type Dashboard={counts:Record<string,number>;profiles:AnyRow[];permissions:Record<string,string[]>};
const roleLabels:{[key:string]:string}={admin:'Administrator',staff:'Staff',coach:'Coach',client:'Client'};
const tabs=['Overview','Admin AI Agents','AI Governance','Users','Clients','Coaches','Applications','Services','Offerings','Bookings','Finance','Payments','Risk & Disputes','Providers'];

export default function AdminPage(){
 const supabase=useMemo(()=>createSupabaseBrowserClient(),[]);
 const [dashboard,setDashboard]=useState<Dashboard|null>(null),[ops,setOps]=useState<Ops>({}),[tab,setTab]=useState('Overview');
 const [loading,setLoading]=useState(true),[message,setMessage]=useState(''),[busy,setBusy]=useState<string|null>(null),[search,setSearch]=useState(''),[currentUserId,setCurrentUserId]=useState('');
 const [aiResult,setAiResult]=useState<any|null>(null),[adminAgents,setAdminAgents]=useState<any[]>([]),[approvalQueue,setApprovalQueue]=useState<any[]>([]),[releaseCandidates,setReleaseCandidates]=useState<any[]>([]),[promptVersions,setPromptVersions]=useState<any[]>([]),[modelVersions,setModelVersions]=useState<any[]>([]);
 async function load(){
  setLoading(true);setMessage('');
  const {data:userData,error:userError}=await supabase.auth.getUser();
  if(userError||!userData.user){window.location.href='/admin/login';return;}
  setCurrentUserId(userData.user.id);
  const {data:roleData,error:roleError}=await supabase.rpc('get_my_role');
  if(roleError){setMessage(`Account verification failed. ${roleError.message}`);setLoading(false);return;}
  if(roleData?.status && roleData.status!=='active'){setMessage('Your Staff/Admin account is not active.');setLoading(false);return;}
  if(roleData?.role!=='admin' && roleData?.role!=='staff'){setMessage('This account does not have Staff/Admin permissions.');setLoading(false);return;}
  const [{data:d,error:de},{data:o,error:oe},agentResult,approvalResult,releaseResult,promptResult,modelResult]=await Promise.all([supabase.rpc('admin_get_platform_dashboard'),supabase.rpc('admin_get_platform_operations'),supabase.from('ai_agent_registry').select('id,name,agent_key,description,status,autonomy_level,human_approval_required,active,owner_role').in('owner_role',['staff','admin']).order('created_at'),supabase.from('ai_human_approval_requests').select('id,request_id,execution_id,requested_by,status,requested_at,approved_by,approved_at,decision_notes').in('status',['pending','approved']).order('requested_at',{ascending:false}),supabase.rpc('get_ai_release_candidates'),supabase.from('ai_prompt_versions').select('id,prompt_key,version,purpose,status,created_by,approved_by,approved_at,created_at').eq('prompt_key','career_discovery_ai_system').order('version',{ascending:false}),supabase.from('ai_model_versions').select('id,provider,model_name,model_version,purpose,status,approved_by,approved_at,created_at').eq('model_name','gpt-5.6-luna').order('created_at',{ascending:false})]);
  if(de||oe||releaseResult.error||promptResult.error||modelResult.error){setMessage((de||oe||releaseResult.error||promptResult.error||modelResult.error)?.message||'Administration data is unavailable.');setLoading(false);return;}
  const approvals=approvalResult.data||[]; const approvedIds=approvals.filter((a:any)=>a.status==='approved'&&a.execution_id).map((a:any)=>a.execution_id);
  const {data:approvedExecutions,error:approvedExecutionsError}=approvedIds.length?await supabase.from('ai_agent_executions').select('id,status,completed_at').in('id',approvedIds):{data:[],error:null};
  if(approvedExecutionsError){setMessage(`Approval status could not be loaded. ${approvedExecutionsError.message}`);setLoading(false);return;}
  const executionById=new Map((approvedExecutions||[]).map((e:any)=>[e.id,e]));
  const visibleApprovals=approvals.filter((a:any)=>a.status==='pending'||executionById.get(a.execution_id)?.status==='awaiting_human_review');
  setDashboard(d as Dashboard);setOps((o||{}) as Ops);setAdminAgents((agentResult.data||[]) as any[]);setApprovalQueue(visibleApprovals as any[]);setReleaseCandidates((releaseResult.data||[]) as any[]);setPromptVersions((promptResult.data||[]) as any[]);setModelVersions((modelResult.data||[]) as any[]);setLoading(false);
 }
 useEffect(()=>{load();setMessage('Admin client is ready. AI Governance controls are interactive.');},[]);
 async function call(name:string,args:Record<string,any>,success:string){setBusy(name);setMessage('');const {error}=await supabase.rpc(name,args);setMessage(error?error.message:success);setBusy(null);await load();}

 async function requestIndependentApproval(requestId:string,executionId:string){setBusy('request-approval-'+requestId);setMessage('Creating independent human-approval request…');const {data,error}=await supabase.rpc('request_ai_human_approval',{p_request_id:requestId,p_execution_id:executionId});setMessage(error?error.message:`Independent approval requested. Approval ID: ${data}`);setBusy(null);await load();}
 async function approvePromptVersion(id:string){setBusy('approve-prompt-'+id);setMessage('Approving prompt version…');const {data,error}=await supabase.rpc('approve_ai_prompt_version',{p_prompt_version_id:id,p_decision_notes:'Independent prompt approval after governed Career Discovery testing.'});setMessage(error?'Prompt approval failed: '+error.message:'Prompt version approved: v'+(data?.version||''));setBusy(null);await load();} async function approveModelVersion(id:string){setBusy('approve-model-'+id);setMessage('Approving model version…');const {data,error}=await supabase.rpc('approve_ai_model_version',{p_model_version_id:id,p_decision_notes:'Independent model approval for the governed Career Discovery service configuration.'});setMessage(error?'Model approval failed: '+error.message:'Model version approved: '+(data?.model_name||'model')+' '+(data?.model_version||''));setBusy(null);await load();} async function runProductionSafetyGate(id:string){setBusy('safety-gate-'+id);setMessage('Running production safety gate…');const {data,error}=await supabase.rpc('evaluate_ai_production_safety_gate',{p_release_candidate_id:id});setMessage(error?'Production safety gate failed: '+error.message:(data?.eligible?'Production safety gate: ELIGIBLE.':'Production safety gate: NOT ELIGIBLE.'));setBusy(null);await load();} async function approveIndependentApproval(approvalId:string){setBusy('approve-approval-'+approvalId);setMessage('Recording independent approval…');const {error}=await supabase.rpc('approve_ai_human_approval',{p_approval_id:approvalId,p_decision_notes:'Reviewed through CareerDev Global AI Governance.'});setMessage(error?error.message:'Independent human approval recorded. The execution can now proceed through the governed completion transition.');setBusy(null);await load();} async function completeApprovedExecution(requestId:string){setBusy('complete-'+requestId);setMessage('Completing approved governed execution…');const {data,error}=await supabase.rpc('transition_ai_agent_execution',{p_request_id:requestId,p_status:'completed',p_event_data:{reason:'Independent human approval confirmed; governed test completion.'}});setMessage(error?`Completion failed: ${error.message}`:`Completion response: ${JSON.stringify(data)}`);setBusy(null);await load();}
 async function runGovernedCareerDiscoveryTest(){
  setBusy('run-career-discovery-test');setMessage('Step 1/5: starting governed test…');setAiResult(null);
  const testCaseId='b294be94-b7c8-4cd1-ad80-c0cdf17794d0';
  const outputSchema={
   type:'object',
   additionalProperties:false,
   properties:{
    career_direction:{type:'string'},
    target_roles:{type:'array',items:{type:'string'}},
    recommendations:{type:'array',items:{type:'string'}},
    gaps:{type:'array',items:{type:'string'}},
    evidence_grounding:{type:'number',minimum:0,maximum:1},
    no_fabrication:{type:'number',minimum:0,maximum:1},
    source_traceability:{type:'number',minimum:0,maximum:1},
    verification_gate:{type:'boolean'},
    mapping_accuracy:{type:'number',minimum:0,maximum:1},
    profile_consistency:{type:'number',minimum:0,maximum:1},
    service_relevance:{type:'number',minimum:0,maximum:1},
    end_to_end_integrity:{type:'number',minimum:0,maximum:1},
    human_review_gate:{type:'boolean'},
    uncertainty_flags:{type:'array',items:{type:'string'}},
    source_refs:{type:'array',items:{type:'string'}},
    unsupported_claims:{type:'integer',minimum:0},
    unverified_applied:{type:'integer',minimum:0},
    fact_classifications:{type:'array',items:{type:'string'}},
    human_approved:{type:'boolean'}
   },
   required:['career_direction','target_roles','recommendations','gaps','evidence_grounding','no_fabrication','source_traceability','verification_gate','mapping_accuracy','profile_consistency','service_relevance','end_to_end_integrity','human_review_gate','uncertainty_flags','source_refs','unsupported_claims','unverified_applied','fact_classifications','human_approved']
  };
  const inputPayload={
   test_class:'grounding',
   test_case:testCaseId,
   purpose:'release_candidate',
   synthetic:true,
   career_profile:{
    education:[{degree:'BSc Economics',institution:'Synthetic University',year:2022}],
    experience:[{role:'Programme Assistant',employer:'Synthetic NGO',years:2,responsibilities:['youth employability programmes','stakeholder coordination']}],
    skills:['project coordination','data analysis','facilitation'],
    target_preferences:{interests:['youth development','workforce development'],work_mode:'hybrid',location:'Abuja'}
   },
   service_request:{type:'Career Intelligence Assessment',goal:'Identify evidence-grounded career directions.'},
   evidence:{source_refs:['synthetic-test-profile'],verification_status:'unverified'},
   output_schema:outputSchema
  };
  try{
   setMessage('Step 2/5: creating governed execution request…');
   const {data:requestId,error:requestError}=await supabase.rpc('request_ai_agent_execution',{p_agent_key:'career_discovery_ai',p_workflow_key:'career_profile_analysis',p_trigger_source:'test_governed',p_input_payload:inputPayload});
   if(requestError||!requestId) throw new Error(requestError?.message||'Could not create governed execution request.');
   setMessage('Step 3/5: preparing governed execution…');
   const {data:executionId,error:prepareError}=await supabase.rpc('prepare_ai_agent_execution',{p_request_id:requestId});
   if(prepareError||!executionId) throw new Error(prepareError?.message||'Could not prepare governed execution.');
   setMessage('Step 4/5: validating authenticated Staff/Admin session…');
   const {data:sessionData,error:sessionError}=await supabase.auth.getSession();
   const token=sessionData.session?.access_token;
   if(sessionError||!token) throw new Error('A valid Staff/Admin session is required to invoke the governed runtime.');
   const runtimeUrl=(process.env.NEXT_PUBLIC_SUPABASE_URL||'https://ufmhrmzumqkjvaezrmxf.supabase.co')+'/functions/v1/careerdev-ai-agent-runtime';
   setMessage('Step 5/5: invoking authenticated AI runtime…');
   const response=await fetch(runtimeUrl,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({request_id:requestId})});
   const body=await response.json();
   if(!response.ok) throw new Error(body?.error||'Governed runtime execution failed.');
   setAiResult({request_id:requestId,execution_id:executionId,...body});
   setMessage('Career Discovery AI governed execution completed through the authenticated runtime. The result is held at the human-review gate. Request independent approval for a second Admin/Staff reviewer.');
  }catch(error:any){
   setMessage(error?.message||'Governed AI test failed.');
  }finally{setBusy(null);}
 }

 async function runStaffAdminAgentTest(agentKey:string){
  const agent=adminAgents.find((a:any)=>a.agent_key===agentKey);
  if(!agent) return;
  const workflowByAgent:any={
   ceo_operations_ai:'executive_performance_review',career_discovery_ai:'career_profile_analysis',cv_linkedin_ai:'cv_service_delivery',lead_generation_ai:'lead_qualification',marketing_content_ai:'content_creation',research_opportunities_ai:'opportunity_research',sales_proposal_ai:'proposal_generation'
  };
  const workflow=workflowByAgent[agentKey];
  const outputSchema={type:'object',additionalProperties:true,properties:{summary:{type:'string'},recommendations:{type:'array',items:{type:'string'}},risks:{type:'array',items:{type:'string'}},next_steps:{type:'array',items:{type:'string'}},evidence_flags:{type:'array',items:{type:'string'}},human_review_required:{type:'boolean'}},required:['summary','recommendations','risks','next_steps','evidence_flags','human_review_required']};
  const syntheticContexts:any={
   ceo_operations_ai:{operational_snapshot:{revenue_trend:'synthetic',service_delivery_quality:'synthetic',client_outcomes:'synthetic',staff_capacity:'synthetic'},request:'Identify operational priorities and risks from supplied synthetic data.'},
   career_discovery_ai:{career_profile:{education:'BSc Economics',experience:'2 years programme coordination',skills:['data analysis','facilitation','project coordination'],interests:['youth development','workforce development']},request:'Identify evidence-grounded career directions.'},
   cv_linkedin_ai:{candidate_profile:{target_role:'Programme Officer',skills:['project coordination','data analysis'],experience:'2 years programme coordination'},request:'Produce truthful CV/LinkedIn positioning recommendations.'},
   lead_generation_ai:{prospect_profile:{segment:'career services buyer',source:'synthetic',consent_status:'unknown'},request:'Qualify the synthetic prospect and draft ethical next steps without outreach.'},
   marketing_content_ai:{campaign:{audience:'young professionals',topic:'career development',channels:['LinkedIn']},request:'Draft evidence-aligned content ideas without unsupported claims.'},
   research_opportunities_ai:{candidate_profile:{location:'Abuja',interests:['youth development','workforce development'],skills:['project coordination']},request:'Structure opportunity-research requirements and identify what must be verified.'},
   sales_proposal_ai:{prospect:{service_interest:'career coaching',budget:'unknown',requirements:'synthetic'},request:'Prepare a transparent service proposal outline without promising outcomes.'}
  };
  const payload={test_class:'staff_admin_governed',test_case:agentKey,synthetic:true,purpose:'functional_validation',...syntheticContexts[agentKey],output_schema:outputSchema};
  setBusy('agent-test-'+agentKey);setMessage('Starting governed test for '+agent.name+'…');setAiResult(null);
  try{
   const {data:requestId,error:requestError}=await supabase.rpc('request_ai_agent_execution',{p_agent_key:agentKey,p_workflow_key:workflow,p_trigger_source:'test_governed',p_input_payload:payload});
   if(requestError||!requestId) throw new Error(requestError?.message||'Could not create execution request.');
   const {data:prepared,error:prepareError}=await supabase.rpc('prepare_ai_agent_execution',{p_request_id:requestId});
   if(prepareError) throw new Error(prepareError.message);
   const {data:sessionData,error:sessionError}=await supabase.auth.getSession();
   const token=sessionData.session?.access_token;
   if(sessionError||!token) throw new Error('A valid Staff/Admin session is required to invoke the governed runtime.');
   const runtimeUrl=(process.env.NEXT_PUBLIC_SUPABASE_URL||'https://ufmhrmzumqkjvaezrmxf.supabase.co')+'/functions/v1/careerdev-ai-agent-runtime';
   const response=await fetch(runtimeUrl,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({request_id:requestId})});
   const body=await response.json();
   if(!response.ok) throw new Error(body?.error||'Governed runtime failed.');
   setAiResult({agent_key:agentKey,request_id:requestId,execution_id:prepared?.execution_id,...body});
   setMessage(agent.name+' completed its authenticated governed test and is held at the human-review gate.');
  }catch(error:any){setMessage(agent.name+' test failed: '+(error?.message||'Unknown error'));}
  finally{setBusy(null);await load();}
 } async function signOut(){await supabase.auth.signOut();window.location.href='/admin/login';}
 const c=dashboard?.counts||{};
 const applications=ops.applications||[];
 const pendingApplications=applications.filter(a=>['submitted','pending','under_review'].includes(String(a.application_status||'').toLowerCase()));
 const cards=[['Total users',c.users],['Clients',c.clients],['Coaches',c.coaches],['Staff',c.staff],['Administrators',c.admins],['Active coaches',c.active_coaches],['Applications',c.coach_applications],['Active services',c.active_services],['Bookings',c.bookings],['Transactions',c.transactions]];
 const filter=(rows:AnyRow[])=>rows.filter(r=>{if(!search.trim())return true;const q=search.toLowerCase();return Object.values(r).some(v=>String(v??'').toLowerCase().includes(q))});
 const btn=(active=false)=>({border:'1px solid #c8d9e8',borderRadius:9,padding:'9px 12px',background:active?'#0b5d9b':'#fff',color:active?'#fff':'#173b59',fontWeight:800,cursor:'pointer' as const});
 const cell={padding:'11px 8px',borderBottom:'1px solid #edf2f6',fontSize:13};
 function Table({rows,columns,actions}:{rows:AnyRow[],columns:string[],actions?:(r:AnyRow)=>ReactNode}){return <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',minWidth:900}}><thead><tr>{columns.map(x=><th key={x} style={{textAlign:'left',padding:'10px 8px',borderBottom:'2px solid #dbe6ef',fontSize:12,color:'#607487'}}>{x.replaceAll('_',' ')}</th>)}{actions&&<th style={{textAlign:'left',padding:'10px 8px',borderBottom:'2px solid #dbe6ef',fontSize:12}}>Actions</th>}</tr></thead><tbody>{filter(rows).map((r,i)=><tr key={String(r.id||i)}>{columns.map(k=><td key={k} style={cell}>{typeof r[k]==='boolean'?(r[k]?'Yes':'No'):String(r[k]??'—')}</td>)}{actions&&<td style={cell}>{actions(r)}</td>}</tr>)}</tbody></table>{filter(rows).length===0&&<p style={{padding:18,color:'#607487'}}>No records found.</p>}</div>}
 function Section({title,children,tools}:{title:string;children:ReactNode;tools?:ReactNode}){return <section style={{background:'#fff',border:'1px solid #d8e6f1',borderRadius:16,padding:20,marginTop:18}}><div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap',marginBottom:14}}><h2 style={{margin:0,fontSize:20}}>{title}</h2>{tools}</div>{children}</section>}
 return <main style={{minHeight:'100vh',background:'radial-gradient(circle at 50% 0%,#f8fcff 0,#eef7ff 45%,#e6f3fc 100%)',color:'#09233f',padding:'36px 16px 70px'}}><div style={{maxWidth:1450,margin:'0 auto'}}>
  <header style={{background:'rgba(255,255,255,.9)',border:'1px solid #d8e6f1',borderRadius:22,padding:'24px 26px',boxShadow:'0 14px 40px rgba(0,60,100,.08)',display:'flex',justifyContent:'space-between',gap:18,alignItems:'flex-start',flexWrap:'wrap'}}><div><div style={{fontWeight:900,letterSpacing:'.08em',textTransform:'uppercase',color:'#1671b9'}}>CareerDev Global</div><h1 style={{fontSize:'clamp(2rem,5vw,3.3rem)',margin:'6px 0'}}>Platform Administration</h1><p style={{maxWidth:900,lineHeight:1.6,margin:0,color:'#527085'}}>One secure control center for users, clients, coaches, marketplace applications, services, bookings, payments, payouts, disputes and operational settings.</p></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><a href="/coach-admin" style={{...btn(),textDecoration:'none'}}>Coach Review</a><button onClick={load} style={btn()}>Refresh</button><button onClick={signOut} style={{...btn(),color:'#8a2d2d'}}>Sign out</button></div></header>
  {message&&<div style={{marginTop:16,padding:14,borderRadius:12,background:'#fff',border:'1px solid #c8d9e8',overflowWrap:'anywhere',boxShadow:'0 8px 25px rgba(0,60,100,.05)'}}>{message}</div>}
  {loading?<p style={{marginTop:28,textAlign:'center',color:'#527085'}}>Loading administration data…</p>:!dashboard?<p style={{marginTop:28,textAlign:'center',color:'#527085'}}>Administration data is unavailable.</p>:<>
   {pendingApplications.length>0&&<section style={{marginTop:18,padding:'18px 20px',borderRadius:16,border:'1px solid #f0c36a',background:'#fff8e8',display:'flex',justifyContent:'space-between',alignItems:'center',gap:16,flexWrap:'wrap',boxShadow:'0 8px 24px rgba(120,80,0,.06)'}}><div><div style={{fontSize:12,fontWeight:900,textTransform:'uppercase',letterSpacing:'.06em',color:'#8a5a00'}}>Coach applications awaiting review</div><div style={{fontSize:16,fontWeight:800,marginTop:4}}>{pendingApplications.length} application{pendingApplications.length===1?'':'s'} require{pendingApplications.length===1?'s':''} your review.</div><div style={{fontSize:13,color:'#6d5a35',marginTop:4}}>Review the application before granting marketplace approval.</div></div><button onClick={()=>setTab('Applications')} style={{...btn(true),background:'#9a6500',borderColor:'#9a6500'}}>Review applications</button></section>}
   <div style={{display:'flex',gap:8,overflowX:'auto',padding:'20px 0 8px',position:'sticky',top:0,zIndex:5,background:'rgba(238,247,255,.94)',backdropFilter:'blur(8px)'}}>{tabs.map(t=><button key={t} onClick={()=>setTab(t)} style={{...btn(tab===t),whiteSpace:'nowrap',position:'relative'}}>{t}{t==='Applications'&&pendingApplications.length>0&&<span style={{marginLeft:6,display:'inline-flex',minWidth:20,height:20,padding:'0 6px',alignItems:'center',justifyContent:'center',borderRadius:999,background:tab===t?'#fff':'#c47a00',color:tab===t?'#0b5d9b':'#fff',fontSize:11,fontWeight:900}}>{pendingApplications.length}</span>}</button>)}</div>
   {tab==='Admin AI Agents'&&<Section title="Staff & Admin AI Agents"><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:14}}>{adminAgents.map((a:any)=><article key={a.id} style={{padding:18,border:'1px solid #d8e6f1',borderRadius:14,background:'#f8fcff'}}><div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center'}}><strong>{a.name}</strong><span style={{fontSize:11,fontWeight:900,padding:'4px 8px',borderRadius:999,background:'#e8eef5',color:'#36566f'}}>{a.status}</span></div><p style={{fontSize:13,lineHeight:1.55,color:'#527085'}}>{a.description}</p><div style={{fontSize:12,lineHeight:1.7}}><div>Owner: <strong>{a.owner_role==='admin'?'Admin':'Staff'}</strong></div><div>Autonomy: {a.autonomy_level}</div><div>Human approval: {a.human_approval_required?'Required':'Not required'}</div></div><button disabled={busy==='agent-test-'+a.agent_key} onClick={()=>runStaffAdminAgentTest(a.agent_key)} style={{...btn(true),marginTop:12,width:'100%'}}>{busy==='agent-test-'+a.agent_key?'Running governed test…':'Run governed functional test'}</button></article>)}</div><p style={{fontSize:12,color:'#607487',marginTop:16}}>Tests use synthetic data and the authenticated governed runtime. Results remain subject to independent human approval; a successful test does not by itself activate production.</p></Section>}
   {approvalQueue.length>0&&<section style={{marginTop:18,padding:'18px 20px',borderRadius:16,border:'1px solid #9ec7e6',background:'#eef8ff'}}><strong>Pending independent AI approvals</strong><div style={{marginTop:8}}>{approvalQueue.length} approval request{approvalQueue.length===1?'':'s'} awaiting review. A requester cannot approve their own execution.</div><button onClick={()=>setTab('AI Governance')} style={{...btn(true),marginTop:10}}>Open AI Governance</button></section>}
   {tab==='AI Governance'&&<Section title="AI Governance — Career Discovery AI" tools={<button type="button" onPointerUp={() => { if (busy!=='run-career-discovery-test') void runGovernedCareerDiscoveryTest(); }} onClick={() => { if (busy!=='run-career-discovery-test') void runGovernedCareerDiscoveryTest(); }} disabled={busy==='run-career-discovery-test'} style={btn(true)}>{busy==='run-career-discovery-test'?'Running governed test…':'Run governed test'}</button>}>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:14}}>
     <div style={{padding:16,border:'1px solid #d8e6f1',borderRadius:12}}>
      <strong>Current release gate</strong>
      <p style={{margin:'8px 0',lineHeight:1.6,color:'#527085'}}>Coming next / Planned. This test uses a synthetic profile, authenticated Staff/Admin execution, configuration snapshots, structured output, quality evaluation and the human-review gate.</p>
      <div style={{fontSize:13,lineHeight:1.7}}>
       <div>Test case: <code>{'b294be94-b7c8-4cd1-ad80-c0cdf17794d0'}</code></div>
       <div>Agent: <strong>Career Discovery AI</strong></div>
       <div>Workflow: <strong>career_profile_analysis</strong></div>
       <div>Approval: <strong>Human approval required</strong></div>
      </div>
     </div>
     <div style={{padding:16,border:'1px solid #d8e6f1',borderRadius:12,background:'#f8fcff'}}>
      <strong>Governance controls</strong>
      <ul style={{lineHeight:1.7,paddingLeft:20,color:'#527085'}}>
       <li>Authenticated runtime only; no auth bypass.</li>
       <li>Evidence grounding and fabrication controls are evaluated.</li>
       <li>Human approval is not self-asserted by the model.</li>
       <li>Test results are persisted to the AI test-run and quality-gate records.</li>
       <li>Production activation remains separate from test execution.</li>
      </ul>
     </div>
    </div>
    <div style={{marginTop:16,padding:16,border:'1px solid #9ec7e6',borderRadius:12,background:'#eef8ff'}}><strong>Prompt & model approval gate</strong><div style={{fontSize:13,color:'#527085',marginTop:5}}>These configuration versions must be independently approved before the production safety gate can pass.</div><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:12,marginTop:12}}>{promptVersions.filter(v=>v.status==='testing').map(v=><div key={v.id} style={{padding:12,border:'1px solid #c8d9e8',borderRadius:10,background:'#fff'}}><div><strong>Prompt v{v.version}</strong></div><div style={{fontSize:12,color:'#607487',marginTop:4}}>{v.prompt_key}</div><div style={{marginTop:8}}>Status: <strong>{v.status}</strong></div><button disabled={busy==='approve-prompt-'+v.id} onClick={()=>approvePromptVersion(v.id)} style={{...btn(true),marginTop:10}}>{busy==='approve-prompt-'+v.id?'Approving…':'Approve prompt version'}</button></div>)}{modelVersions.filter(v=>v.status==='testing').map(v=><div key={v.id} style={{padding:12,border:'1px solid #c8d9e8',borderRadius:10,background:'#fff'}}><div><strong>Model {v.model_name}</strong></div><div style={{fontSize:12,color:'#607487',marginTop:4}}>Version {v.model_version} · {v.provider}</div><div style={{marginTop:8}}>Status: <strong>{v.status}</strong></div><button disabled={busy==='approve-model-'+v.id} onClick={()=>approveModelVersion(v.id)} style={{...btn(true),marginTop:10}}>{busy==='approve-model-'+v.id?'Approving…':'Approve model version'}</button></div>)}</div></div>{releaseCandidates.filter(r=>r.status==='approved').length>0&&<div style={{marginTop:16,padding:16,border:'1px solid #9ec7e6',borderRadius:12,background:'#eef8ff'}}><strong>Production Safety Gate</strong><div style={{marginTop:8}}>{releaseCandidates.filter(r=>r.status==='approved').map(r=><button key={r.id} disabled={busy==='safety-gate-'+r.id} onClick={()=>runProductionSafetyGate(r.id)} style={{...btn(true),marginTop:8}}>{busy==='safety-gate-'+r.id?'Running…':'Run Production Safety Gate'}</button>)}</div></div>}{releaseCandidates.filter(r=>r.status==='testing').length>0&&<div style={{marginTop:16,padding:16,border:'1px solid #d9c27a',borderRadius:12,background:'#fffaf0'}}><strong>Release candidates awaiting independent approval</strong>{releaseCandidates.filter(r=>r.status==='testing').map(r=><div key={r.id} style={{marginTop:10,padding:12,border:'1px solid #eadfb8',borderRadius:10,background:'#fff'}}><div><strong>{r.name}</strong></div><div style={{fontSize:12,color:'#607487',marginTop:4}}>Release candidate: <code>{r.id}</code></div><div style={{marginTop:10}}><button disabled={busy==='approve-release-'+r.id} onClick={async()=>{setBusy('approve-release-'+r.id);setMessage('Approving release candidate…');const {data,error}=await supabase.rpc('approve_ai_release_candidate',{p_release_candidate_id:r.id,p_decision_notes:'Independent release approval after governed testing and regression review.'});setMessage(error?`Release approval failed: ${error.message}`:`Release candidate approved: ${data?.name||r.name}`);setBusy(null);await load();}} style={btn(true)}>Approve release candidate</button></div></div>)}</div>}{approvalQueue.length>0&&<div style={{marginTop:16,padding:16,border:'1px solid #9ec7e6',borderRadius:12,background:'#eef8ff'}}><strong>Governed approval queue</strong>{approvalQueue.map(a=><div key={a.id} style={{marginTop:10,padding:12,border:'1px solid #c8d9e8',borderRadius:10,background:'#fff'}}><div style={{fontSize:12,color:'#607487'}}>Execution</div><code>{a.execution_id||'—'}</code><div style={{marginTop:6}}>Status: <strong>{a.status}</strong></div><div style={{marginTop:10}}>{a.status==='pending'?<button disabled={busy==='approve-approval-'+a.id} onClick={()=>approveIndependentApproval(a.id)} style={btn(true)}>Approve</button>:<button disabled={busy==='complete-'+a.request_id} onClick={()=>completeApprovedExecution(a.request_id)} style={btn(true)}>Complete approved execution</button>}</div></div>)}</div>}
    {aiResult&&<div style={{marginTop:16,padding:16,border:'1px solid #c8d9e8',borderRadius:12,background:'#fff'}}>
     <strong>Latest governed execution</strong><div style={{marginTop:10}}>{aiResult.request_id&&aiResult.execution_id&&<button disabled={busy==='request-approval-'+aiResult.request_id} onClick={()=>requestIndependentApproval(aiResult.request_id,aiResult.execution_id)} style={btn(true)}>Request independent approval</button>}<span style={{marginLeft:8,padding:'7px 10px',borderRadius:8,background:'#e8f6ea',color:'#276738',fontWeight:800}}>Independent approval recorded</span><button disabled={busy==='complete-'+aiResult.request_id} onClick={()=>completeApprovedExecution(aiResult.request_id)} style={{...btn(true),marginLeft:8}}>Complete approved execution</button></div>
     <pre style={{marginTop:10,whiteSpace:'pre-wrap',overflowX:'auto',fontSize:12,lineHeight:1.5}}>{JSON.stringify(aiResult,null,2)}</pre>
    </div>}
   </Section>}

   {tab==='Overview'&&<><section style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:10,marginTop:12}}>{cards.map(([label,value])=><div key={String(label)} style={{background:'#fff',borderRadius:14,padding:16,border:'1px solid #d8e6f1',boxShadow:'0 8px 24px rgba(0,60,100,.05)'}}><div style={{fontSize:11,color:'#607487'}}>{label}</div><strong style={{fontSize:26}}>{value??0}</strong></div>)}</section><Section title="Role permissions"><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:14}}>{Object.entries(dashboard.permissions).map(([r,ps])=><div key={r} style={{padding:15,border:'1px solid #e1ebf3',borderRadius:12}}><strong>{roleLabels[r]||r}</strong><ul style={{lineHeight:1.7,paddingLeft:18}}>{ps.map(x=><li key={x}>{x.replaceAll('_',' ')}</li>)}</ul></div>)}</div></Section></>}
   {tab==='Users'&&<Section title="User & access management" tools={<input placeholder="Search users…" value={search} onChange={e=>setSearch(e.target.value)} style={{padding:9,border:'1px solid #c8d9e8',borderRadius:9}}/>}><Table rows={ops.profiles||[]} columns={['full_name','email','role','status','country','timezone','created_at']} actions={p=><div style={{display:'flex',gap:6,flexWrap:'wrap'}}><select disabled={p.id===currentUserId||busy==='admin_set_user_role'} value={p.role} onChange={e=>call('admin_set_user_role',{p_user_id:p.id,p_role:e.target.value},'User role updated.')} style={{padding:7,borderRadius:7,border:'1px solid #c8d9e8'}}><option value="client">Client</option><option value="coach">Coach</option><option value="staff">Staff</option><option value="admin">Administrator</option></select><select disabled={busy==='admin_update_profile_status'} value={p.status||'active'} onChange={e=>call('admin_update_profile_status',{p_user_id:p.id,p_status:e.target.value},'User status updated.')} style={{padding:7,borderRadius:7,border:'1px solid #c8d9e8'}}><option value="active">Active</option><option value="inactive">Inactive</option><option value="suspended">Suspended</option></select></div>}/></Section>}
   {tab==='Clients'&&<Section title="Client management"><Table rows={ops.clients||[]} columns={['name','email','status','created_at']} actions={p=><select disabled={busy==='admin_update_client_status'} value={p.status||'active'} onChange={e=>call('admin_update_client_status',{p_client_id:p.id,p_status:e.target.value},'Client status updated.')} style={{padding:7,borderRadius:7,border:'1px solid #c8d9e8'}}><option value="active">Active</option><option value="inactive">Inactive</option><option value="suspended">Suspended</option></select>}/></Section>}
   {tab==='Coaches'&&<Section title="Coach management"><Table rows={ops.coaches||[]} columns={['name','email','professional_title','application_status','verification_status','marketplace_status','active']} actions={p=><select disabled={busy==='admin_update_coach_marketplace_status'} value={p.marketplace_status||'pending_activation'} onChange={e=>call('admin_update_coach_marketplace_status',{p_coach_id:p.id,p_marketplace_status:e.target.value},'Coach marketplace status updated.')} style={{padding:7,borderRadius:7,border:'1px solid #c8d9e8'}}><option value="pending_activation">Pending activation</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="suspended">Suspended</option></select>}/></Section>}
   {tab==='Applications'&&<Section title="Coach applications" tools={<span style={{fontSize:13,color:'#607487'}}>{pendingApplications.length} awaiting review</span>}><Table rows={applications} columns={['display_name','professional_title','country','timezone','application_status','agreements','created_at']} actions={p=><div style={{display:'flex',gap:6}}><button disabled={busy==='admin_review_coach_application'} style={btn()} onClick={()=>call('admin_review_coach_application',{p_application_id:p.id,p_decision:'approve',p_notes:'Approved from platform administration.'},'Coach application approved.')}>Approve</button><button disabled={busy==='admin_review_coach_application'} style={btn()} onClick={()=>call('admin_review_coach_application',{p_application_id:p.id,p_decision:'reject',p_notes:'Rejected from platform administration.'},'Coach application rejected.')}>Reject</button></div>}/></Section>}
   {tab==='Services'&&<Section title="Service catalogue"><Table rows={ops.services||[]} columns={['name','slug','category','price','currency','active','created_at']} actions={p=><button style={btn()} disabled={busy==='admin_update_service'} onClick={()=>call('admin_update_service',{p_service_id:p.id,p_name:p.name,p_category:p.category||'',p_description:p.description||'',p_price:Number(p.price||0),p_currency:p.currency||'NGN',p_active:!p.active},p.active?'Service deactivated.':'Service activated.')}>{p.active?'Deactivate':'Activate'}</button>}/></Section>}
   {tab==='Offerings'&&<Section title="Coach service offerings"><Table rows={ops.offerings||[]} columns={['coach_name','title','price','currency','duration_minutes','delivery_mode','active']} actions={p=><button style={btn()} disabled={busy==='admin_update_offering_status'} onClick={()=>call('admin_update_offering_status',{p_offering_id:p.id,p_active:!p.active},p.active?'Offering deactivated.':'Offering activated.')}>{p.active?'Deactivate':'Activate'}</button>}/></Section>}
   {tab==='Bookings'&&<Section title="Marketplace bookings"><Table rows={ops.bookings||[]} columns={['client_name','coach_name','start_at','end_at','timezone','status','created_at']} actions={p=><select disabled={busy==='admin_update_booking_status'} value={p.status} onChange={e=>call('admin_update_booking_status',{p_booking_id:p.id,p_status:e.target.value,p_notes:'Administrative status update.'},'Booking status updated.')} style={{padding:7,borderRadius:7,border:'1px solid #c8d9e8'}}><option value="requested">Requested</option><option value="confirmed">Confirmed</option><option value="declined">Declined</option><option value="cancelled">Cancelled</option><option value="completed">Completed</option></select>}/></Section>}
   {tab==='Finance'&&<><Section title="Transactions"><Table rows={ops.transactions||[]} columns={['booking_id','gross_amount','currency','payment_status','fulfillment_status','release_eligibility','provider_key','provider_reference','created_at']}/></Section><Section title="Coach payouts"><Table rows={ops.payouts||[]} columns={['coach_id','amount','currency','status','release_check_status','created_at']}/></Section></>}
   {tab==='Payments'&&<Section title="Payment transactions"><Table rows={ops.payments||[]} columns={['transaction_id','provider_key','reference','type','amount','currency','status','processed_at','created_at']}/></Section>}
   {tab==='Risk & Disputes'&&<><Section title="Disputes"><Table rows={ops.disputes||[]} columns={['transaction_id','category','reason','status','amount_at_risk','currency','created_at']}/></Section><Section title="Refund requests"><Table rows={ops.refunds||[]} columns={['transaction_id','amount','reason','status','requested_by','created_at']}/></Section></>}
   {tab==='Providers'&&<Section title="Payment providers"><Table rows={ops.providers||[]} columns={['provider_key','display_name','active','supported_currencies','supported_countries']} actions={p=><button style={btn()} disabled={busy==='admin_update_payment_provider_status'} onClick={()=>call('admin_update_payment_provider_status',{p_provider_id:p.id,p_active:!p.active},p.active?'Provider disabled.':'Provider enabled.')}>{p.active?'Disable':'Enable'}</button>}/><p style={{fontSize:12,color:'#607487',marginTop:14}}>Payment records and financial state are displayed for oversight. Provider credentials remain in Supabase Edge Function secrets and are never exposed here.</p></Section>}
  </>}
 </div></main>}
