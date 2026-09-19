'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '../../lib/supabase-browser';

type Ticket={id:string;subject:string;description:string;priority_tier:string;sla_target_at:string|null;status:string;created_at:string};

export default function SupportPage(){
 const supabase=createSupabaseBrowserClient();
 const [tickets,setTickets]=useState<Ticket[]>([]);
 const [subject,setSubject]=useState('');
 const [description,setDescription]=useState('');
 const [loading,setLoading]=useState(true);
 const [sending,setSending]=useState(false);
 const [message,setMessage]=useState('');
 const [summary,setSummary]=useState<any>(null);

 async function load(){
  setLoading(true);
  const [{data,error},{data:sum}]=await Promise.all([
   supabase.from('support_tickets').select('id,subject,description,priority_tier,sla_target_at,status,created_at').order('created_at',{ascending:false}),
   supabase.rpc('get_my_support_summary')
  ]);
  if(error)setMessage(error.message);
  setTickets((data||[]) as Ticket[]); setSummary(sum||null); setLoading(false);
 }
 useEffect(()=>{void load()},[]);

 async function submit(e:React.FormEvent){
  e.preventDefault(); setSending(true); setMessage('');
  try{
   const {data,error}=await supabase.functions.invoke('careerdev-support-ticket',{body:{subject,description}});
   if(error)throw error;
   setMessage(`Support ticket created. Priority tier: ${data?.priority_tier||'standard'}.`);
   setSubject('');setDescription('');await load();
  }catch(e:any){setMessage(e?.message||'Could not create your support ticket.')}
  finally{setSending(false)}
 }
 return <main style={{minHeight:'100vh',background:'linear-gradient(180deg,#f7fbff,#eef6fb)',color:'#09233f',padding:'40px 16px 80px'}}>
  <div style={{maxWidth:1000,margin:'0 auto'}}>
   <a href="/" style={{color:'#176da9',fontWeight:800,textDecoration:'none'}}>← CareerDev Global</a>
   <header style={{margin:'28px 0'}}><div style={{fontSize:12,fontWeight:900,letterSpacing:1.2,color:'#1671b9'}}>CAREERDEV GLOBAL SUPPORT</div><h1 style={{fontSize:'clamp(2rem,5vw,3.3rem)',margin:'8px 0'}}>How can we help?</h1><p style={{color:'#527085',lineHeight:1.6,maxWidth:720}}>Create a support request. Your active subscription determines the support routing tier automatically.</p></header>
   {summary&&<section style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginBottom:20}}>
    {[['Open tickets',summary.open_tickets||0],['Priority tickets',summary.priority_tickets||0],['Premium tickets',summary.premium_tickets||0]].map(([k,v])=><div key={String(k)} style={{background:'#fff',border:'1px solid #d8e6f1',borderRadius:14,padding:16}}><div style={{fontSize:12,color:'#718394',fontWeight:800}}>{k}</div><strong style={{fontSize:25}}>{v}</strong></div>)}
   </section>}
   {message&&<div style={{padding:14,marginBottom:16,borderRadius:12,background:'#fff4e5',border:'1px solid #f0c36a',color:'#684b00'}}>{message}</div>}
   <section style={{background:'#fff',border:'1px solid #d8e6f1',borderRadius:18,padding:22,marginBottom:24}}>
    <h2 style={{marginTop:0}}>Create a support request</h2>
    <form onSubmit={submit} style={{display:'grid',gap:14}}>
     <input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Subject" required style={{padding:13,border:'1px solid #c8d9e8',borderRadius:10}}/>
     <textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Tell us what you need help with..." required rows={7} style={{padding:13,border:'1px solid #c8d9e8',borderRadius:10,resize:'vertical'}}/>
     <button disabled={sending} style={{padding:'12px 16px',border:0,borderRadius:10,background:'#0b5d9b',color:'#fff',fontWeight:900}}>{sending?'Submitting…':'Submit support request'}</button>
    </form>
   </section>
   <section style={{background:'#fff',border:'1px solid #d8e6f1',borderRadius:18,padding:22}}>
    <h2 style={{marginTop:0}}>Your requests</h2>
    {loading?<p>Loading…</p>:tickets.length===0?<p style={{color:'#718394'}}>No support requests yet.</p>:<div style={{display:'grid',gap:12}}>{tickets.map(t=><article key={t.id} style={{border:'1px solid #e1ebf3',borderRadius:12,padding:15}}><div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><strong>{t.subject}</strong><span style={{fontSize:12,fontWeight:900,textTransform:'uppercase'}}>{t.priority_tier} · {t.status}</span></div><p style={{color:'#527085',marginBottom:8}}>{t.description}</p>{t.sla_target_at&&<small style={{color:'#718394'}}>SLA target: {new Date(t.sla_target_at).toLocaleString()}</small>}</article>)}</div>}
   </section>
  </div>
 </main>
