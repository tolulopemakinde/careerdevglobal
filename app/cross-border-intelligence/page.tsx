'use client';

import { useState } from 'react';
import { createSupabaseBrowserClient } from '../../lib/supabase-browser';

export default function CrossBorderIntelligencePage(){
 const supabase=createSupabaseBrowserClient();
 const [form,setForm]=useState({target_country:'',origin_country:'',target_role:'',present_role:'',relocation_intent:'',work_authorization_context:'',request_details:''});
 const [busy,setBusy]=useState(false); const [message,setMessage]=useState(''); const [result,setResult]=useState<any>(null);
 const update=(k:string,v:string)=>setForm(x=>({...x,[k]:v}));
 async function submit(e:React.FormEvent){
  e.preventDefault();setBusy(true);setMessage('');setResult(null);
  try{
   const {data,error}=await supabase.functions.invoke('careerdev-cross-border-intelligence',{body:form});
   if(error)throw error;
   setResult(data);setMessage('Your Cross-Border Career Intelligence request has been queued for processing.');
  }catch(e:any){setMessage(e?.message||'This feature requires an active eligible subscription.')}
  finally{setBusy(false)}
 }
 return <main style={{minHeight:'100vh',background:'linear-gradient(180deg,#f7fbff,#eef6fb)',color:'#09233f',padding:'40px 16px 80px'}}>
  <div style={{maxWidth:900,margin:'0 auto'}}>
   <a href="/" style={{color:'#176da9',fontWeight:800,textDecoration:'none'}}>← CareerDev Global</a>
   <header style={{margin:'28px 0'}}><div style={{fontSize:12,fontWeight:900,letterSpacing:1.2,color:'#1671b9'}}>ELITE CAREER INTELLIGENCE</div><h1 style={{fontSize:'clamp(2rem,5vw,3.3rem)',margin:'8px 0'}}>Cross-Border Career Intelligence</h1><p style={{color:'#527085',lineHeight:1.65,maxWidth:760}}>Submit an international career question covering target markets, roles, relocation context and work-authorization considerations. AI processing is governed and important outputs remain subject to human review.</p></header>
   {message&&<div style={{padding:14,marginBottom:16,borderRadius:12,background:'#fff4e5',border:'1px solid #f0c36a',color:'#684b00'}}>{message}</div>}
   {result&&<section style={{background:'#edf8f1',border:'1px solid #b9dfc4',borderRadius:14,padding:16,marginBottom:18}}><strong>Request ID:</strong> {result.request_id}<br/><strong>Status:</strong> {result.status}</section>}
   <form onSubmit={submit} style={{background:'#fff',border:'1px solid #d8e6f1',borderRadius:18,padding:22,display:'grid',gap:14}}>
    {([['origin_country','Current country'],['target_country','Target country'],['present_role','Current role'],['target_role','Target role'],['relocation_intent','Relocation intent'],['work_authorization_context','Work-authorization context']] as const).map(([k,label])=><input key={k} value={form[k]} onChange={e=>update(k,e.target.value)} placeholder={label} style={{padding:13,border:'1px solid #c8d9e8',borderRadius:10}} required={k==='target_country'}/>)}
    <textarea value={form.request_details} onChange={e=>update('request_details',e.target.value)} placeholder="What would you like CareerDev Global to analyse?" rows={7} style={{padding:13,border:'1px solid #c8d9e8',borderRadius:10,resize:'vertical'}}/>
    <button disabled={busy} style={{padding:'12px 16px',border:0,borderRadius:10,background:'#0b5d9b',color:'#fff',fontWeight:900}}>{busy?'Submitting…':'Request Cross-Border Intelligence'}</button>
   </form>
   <p style={{fontSize:12,color:'#718394',lineHeight:1.6,marginTop:16}}>Career intelligence is decision support. It does not guarantee employment, immigration approval, salary, or other outcomes. Verify current legal and market information before making consequential decisions.</p>
  </div>
 </main>
