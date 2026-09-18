'use client';

import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '../../lib/supabase-browser';

type Agent={id:string;agent_key:string;name:string;description:string;agent_category:string;status:string;human_approval_required:boolean};
const groups:Record<string,string>={career_intelligence:'Career Intelligence',service_delivery:'Career Documents & Services',research:'Research & Opportunities',governance:'Governance & Quality'};

export default function AgentsPage(){
 const supabase=useMemo(()=>createSupabaseBrowserClient(),[]);
 const [agents,setAgents]=useState<Agent[]>([]),[role,setRole]=useState(''),[profile,setProfile]=useState<any>(null),[loading,setLoading]=useState(true),[running,setRunning]=useState<string|null>(null),[message,setMessage]=useState(''),[result,setResult]=useState<any>(null);
 useEffect(()=>{void load()},[]);
 async function load(){
  setLoading(true);setMessage('');
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){setMessage('Please sign in to use CareerDev Global AI Agents.');setLoading(false);return}
  const {data:me}=await supabase.from('profiles').select('role,status,full_name').eq('id',user.id).single();
  if(!me||me.status!=='active'||!['client','coach'].includes(me.role)){setMessage('This AI Agent workspace is available to active Clients and Coaches.');setLoading(false);return}
  setRole(me.role);
  const {data:a,error:ae}=await supabase.from('ai_agent_registry').select('id,agent_key,name,description,agent_category,status,human_approval_required').eq('active',true).eq('owner_role','client_coach').order('created_at');
  if(ae){setMessage(ae.message);setLoading(false);return}
  setAgents((a||[]) as Agent[]);
  const {data:p}=await supabase.from('career_intelligence_profiles').select('*').eq('profile_id',user.id).maybeSingle();
  if(p)setProfile(p);
  else {
   const {data:created}=await supabase.from('career_intelligence_profiles').insert({profile_id:user.id,profile_data:{name:me.full_name||''}}).select('*').single();
   if(created)setProfile(created);
  }
  setLoading(false);
 }
 async function run(agent:Agent){
  setRunning(agent.agent_key);setMessage('Preparing a governed '+agent.name+' session…');setResult(null);
  try{
   const workflow=agent.agent_key+'_session';
   const schema={type:'object',additionalProperties:false,properties:{summary:{type:'string'},recommendations:{type:'array',items:{type:'string'}},next_steps:{type:'array',items:{type:'string'}},uncertainty_flags:{type:'array',items:{type:'string'}},source_refs:{type:'array',items:{type:'string'}},human_review_required:{type:'boolean'}},required:['summary','recommendations','next_steps','uncertainty_flags','source_refs','human_review_required']};
   const input={profile_id:profile?.profile_id,career_intelligence_profile:profile?.profile_data||{},agent_goal:agent.description,output_schema:schema,human_review_required:true};
   const r=await supabase.rpc('request_ai_agent_execution',{p_agent_key:agent.agent_key,p_workflow_key:workflow,p_trigger_source:'client_coach_workspace',p_input_payload:input});
   if(r.error||!r.data)throw new Error(r.error?.message||'Could not create the governed execution request.');
   const p=await supabase.rpc('prepare_ai_agent_execution',{p_request_id:r.data});
   if(p.error||!p.data)throw new Error(p.error?.message||'Could not prepare the governed execution.');
   const {data:{session}}=await supabase.auth.getSession();if(!session)throw new Error('Your session expired. Please sign in again.');
   const response=await fetch((process.env.NEXT_PUBLIC_SUPABASE_URL||'https://ufmhrmzumqkjvaezrmxf.supabase.co')+'/functions/v1/careerdev-ai-agent-runtime',{method:'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({request_id:r.data})});
   const body=await response.json();if(!response.ok)throw new Error(body?.error||'The governed AI runtime could not complete the request.');
   setResult(body);setMessage(agent.name+' completed a governed execution. The output remains subject to human review where required.');
  }catch(e:any){setMessage(e?.message||'AI Agent execution failed.')}finally{setRunning(null)}
 }
 const grouped=agents.reduce((acc,a)=>(acc[a.agent_category]??=[]).push(a)&&acc,{ } as Record<string,Agent[]>);
 return <main style={{minHeight:'100vh',background:'linear-gradient(180deg,#f7fbff,#eef6fb)',color:'#09233f',padding:'32px 16px 70px'}}><div style={{maxWidth:1200,margin:'0 auto'}}>
  <header style={{display:'flex',justifyContent:'space-between',gap:20,alignItems:'center',flexWrap:'wrap',marginBottom:28}}><div><a href="/" style={{color:'#176da9',fontWeight:800,textDecoration:'none'}}>← CareerDev Global</a><h1 style={{fontSize:'clamp(2rem,5vw,3.2rem)',margin:'10px 0 6px'}}>CareerDev AI Agents</h1><p style={{margin:0,color:'#527085',maxWidth:760}}>Sixteen specialized agents working from one shared Career Intelligence Profile. Your information is not intended to be maintained as separate agent-specific profiles.</p></div><a href="/career-intelligence" style={{padding:'10px 14px',border:'1px solid #c8d9e8',borderRadius:9,background:'#fff',color:'#173b59',fontWeight:800,textDecoration:'none'}}>Career Intelligence Profile</a></header>
  {!role&&<section style={{background:'#fff',padding:22,borderRadius:16,border:'1px solid #d8e6f1'}}><strong>{message||'Sign in to access your AI Agents.'}</strong><p style={{color:'#607487'}}>Clients and Coaches have access to the specialized CareerDev Global agent workspace.</p><a href="/account" style={{display:'inline-block',padding:'10px 14px',borderRadius:9,background:'#0b5d9b',color:'#fff',textDecoration:'none',fontWeight:800}}>Sign in / Account</a></section>}
  {role&&<><section style={{background:'#fff',padding:18,borderRadius:16,border:'1px solid #d8e6f1',marginBottom:24}}><div style={{fontSize:12,textTransform:'uppercase',letterSpacing:'.08em',fontWeight:900,color:'#1671b9'}}>Shared intelligence layer</div><h2 style={{margin:'6px 0'}}>Career Intelligence Profile™</h2><p style={{margin:0,color:'#527085'}}>All {agents.length} agents use the same evolving profile context. {profile?.profile_data?.name?'Profile: '+profile.profile_data.name+'.':'Start by adding your career evidence through Career Intelligence.'}</p></section>
   {loading?<p>Loading agents…</p>:Object.entries(grouped).map(([cat,list])=><section key={cat} style={{marginBottom:28}}><h2 style={{fontSize:22}}>{groups[cat]||cat}</h2><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:14}}>{list.map(a=><article key={a.id} style={{background:'#fff',border:'1px solid #d8e6f1',borderRadius:16,padding:18,boxShadow:'0 8px 25px rgba(0,60,100,.05)'}}><div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'start'}}><h3 style={{margin:0}}>{a.name}</h3><span style={{fontSize:11,fontWeight:900,padding:'4px 7px',borderRadius:999,background:'#eef4f8',whiteSpace:'nowrap'}}>{a.status}</span></div><p style={{color:'#527085',lineHeight:1.55,minHeight:66}}>{a.description}</p><button onClick={()=>run(a)} disabled={running!==null} style={{width:'100%',padding:'11px 14px',border:0,borderRadius:9,background:'#0b5d9b',color:'#fff',fontWeight:900,cursor:'pointer'}}>{running===a.agent_key?'Running governed session…':'Open Agent'}</button><small style={{display:'block',marginTop:9,color:'#718394'}}>Human approval gate: {a.human_approval_required?'Required':'Not required'}</small></article>)}</div></section>)}
   {message&&<section style={{padding:14,borderRadius:12,background:'#fff',border:'1px solid #c8d9e8',marginTop:18}}>{message}</section>}
   {result&&<section style={{marginTop:18,padding:18,borderRadius:16,background:'#fff',border:'1px solid #c8d9e8'}}><h2 style={{marginTop:0}}>Latest governed result</h2><pre style={{whiteSpace:'pre-wrap',overflowX:'auto',fontSize:12,lineHeight:1.5}}>{JSON.stringify(result,null,2)}</pre></section>}
  </>}
  <footer style={{marginTop:45,paddingTop:20,borderTop:'1px solid #d8e6f1',fontSize:12,color:'#718394'}}>AI processes. Humans decide. CareerDev Global agents provide decision support and do not replace qualified professional judgment.</footer>
 </div></main>
}
