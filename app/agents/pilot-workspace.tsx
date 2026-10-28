'use client';
import { useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '../../lib/supabase-browser';

type Output={summary:string;recommendations:string[];next_steps:string[];uncertainty_flags:string[];generated_by_ai:boolean};
export default function PilotWorkspace({agentKey,name}:{agentKey:string;name:string}){
 const supabase=useMemo(()=>createSupabaseBrowserClient(),[]);
 const [goal,setGoal]=useState(''),[target,setTarget]=useState(''),[skills,setSkills]=useState(''),[gaps,setGaps]=useState('');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[output,setOutput]=useState<Output|null>(null);
 async function run(e:React.FormEvent){
  e.preventDefault();setBusy(true);setMessage('');setOutput(null);
  try{
   const {data:id,error:requestError}=await supabase.rpc('request_ai_agent_execution',{p_agent_key:agentKey,p_workflow_key:null,p_trigger_source:'manual',p_input_payload:{goals:[goal],target_role:target,skills:skills.split(',').map(x=>x.trim()).filter(Boolean),gaps:gaps.split(',').map(x=>x.trim()).filter(Boolean)}});
   if(requestError||!id)throw new Error('Your access could not be authorized. Please check your subscription.');
   const {error:prepareError}=await supabase.rpc('prepare_ai_agent_execution',{p_request_id:id});
   if(prepareError)throw new Error('This guidance request could not be prepared.');
   const {data,error}=await supabase.functions.invoke('careerdev-ai-agent-runtime',{body:{request_id:id}});
   if(error||!data?.output||data.output.generated_by_ai!==false)throw new Error('Structured guidance is unavailable. Please try again later.');
   setOutput(data.output as Output);setMessage(data.human_review_required?'Draft guidance saved for human review.':'Structured guidance saved. Coach validation is recommended.');
  }catch(e){setMessage(e instanceof Error?e.message:'Could not prepare guidance.')}finally{setBusy(false);}
 }
 const field={display:'block',width:'100%',padding:10,border:'1px solid #b9d7ea',borderRadius:8,margin:'6px 0 12px'};
 return <section style={{padding:20,borderRadius:16,background:'#fff',border:'1px solid #b9d7ea',marginBottom:24}} aria-label={name}>
  <h2>{name}</h2><p>Structured guidance uses only the information you supply below. No AI generation or live research is performed.</p>
  <form onSubmit={run}>
   <label>Your career goal<input required maxLength={2000} value={goal} onChange={e=>setGoal(e.target.value)} style={field}/></label>
   <label>Target role<input maxLength={200} value={target} onChange={e=>setTarget(e.target.value)} style={field}/></label>
   <label>Documented skills, separated by commas<input maxLength={2000} value={skills} onChange={e=>setSkills(e.target.value)} style={field}/></label>
   <label>Known development gaps, separated by commas<input maxLength={2000} value={gaps} onChange={e=>setGaps(e.target.value)} style={field}/></label>
   <button disabled={busy} style={{padding:'11px 16px',border:0,borderRadius:9,background:'#0b5d9b',color:'#fff',fontWeight:900}}>{busy?'Preparing guidance…':'Prepare structured guidance'}</button>
  </form>
  {message&&<p role="status">{message}</p>}
  {output&&<article><h3>{output.summary}</h3><ul>{output.recommendations.map((x,i)=><li key={i}>{x}</li>)}</ul><h4>Next steps</h4><ul>{output.next_steps.map((x,i)=><li key={i}>{x}</li>)}</ul>{output.uncertainty_flags.map((x,i)=><p key={i}>{x}</p>)}</article>}
 </section>;
}
