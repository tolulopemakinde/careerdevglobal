'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '../../lib/supabase-browser';

type Plan={plan_key:string;name:string;description:string;monthly_price:number;annual_price:number;currency:string;monthly_credits:number;included_agents:string[]};
const planOrder=['fresher','starter','professional','career_pro','elite'];

export default function PricingPage(){
  const supabase=createSupabaseBrowserClient();
  const [plans,setPlans]=useState<Plan[]>([]);
  const [interval,setInterval]=useState<'monthly'|'annual'>('monthly');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState<string|null>(null);
  const [message,setMessage]=useState('');
  const [currentPlan,setCurrentPlan]=useState<string|null>(null);

  useEffect(()=>{void load()},[]);
  async function load(){
    const params=new URLSearchParams(window.location.search);
    const reference=params.get('reference');
    if(params.get('payment')==='return'&&reference){
      setMessage('Verifying your Paystack payment…');
      const {data,error}=await supabase.functions.invoke('careerdev-ai-subscription-verify',{body:{reference}});
      if(error||!data?.status){setMessage(data?.error||error?.message||'Payment verification is still pending. Please refresh shortly.');}
      else{setMessage('Payment verified. Your AI Agent subscription is now active.');window.history.replaceState({},'', '/pricing');}
    }
    const [{data:plansData},{data:subscription}]=await Promise.all([
      supabase.from('ai_agent_subscription_plans').select('plan_key,name,description,monthly_price,annual_price,currency,monthly_credits,included_agents').eq('active',true).order('sort_order'),
      supabase.rpc('get_my_ai_subscription')
    ]);
    setPlans(((plansData||[]) as Plan[]).sort((a,b)=>planOrder.indexOf(a.plan_key)-planOrder.indexOf(b.plan_key)));
    setCurrentPlan(Array.isArray(subscription)&&subscription[0]?.plan_key?subscription[0].plan_key:null);
    setLoading(false);
  }
  async function subscribe(planKey:string){
    setBusy(planKey);setMessage('');
    try{
      const {data:{user}}=await supabase.auth.getUser();
      if(!user){window.location.assign('/account?next=/pricing');return}
      const {data,error}=await supabase.functions.invoke('careerdev-ai-subscription-checkout',{body:{plan_key:planKey,billing_interval:interval}});
      if(error){
        let detail='';
        try{detail=error.context?JSON.stringify(await error.context.json()):''}catch{}
        let parsed='';
        try{const body=detail?JSON.parse(detail):null;parsed=body?.error||body?.detail||''}catch{}
        throw new Error(parsed||error.message||'Could not start checkout.');
      }
      const url=data?.authorization_url||data?.checkout_url;
      if(typeof url!=='string'||!url) throw new Error(data?.error||'Payment checkout is not currently available.');
      window.location.assign(url);
    }catch(e:any){setMessage(e?.message||'Could not start subscription checkout.')}finally{setBusy(null)}
  }
  return <main style={{minHeight:'100vh',background:'linear-gradient(180deg,#f7fbff,#eef6fb)',color:'#09233f',padding:'40px 16px 80px'}}>
    <div style={{maxWidth:1240,margin:'0 auto'}}>
      <section style={{position:'relative',minHeight:360,borderRadius:22,overflow:'hidden',marginBottom:30,backgroundImage:"linear-gradient(90deg,rgba(3,24,55,.94) 0%,rgba(5,35,74,.82) 55%,rgba(5,35,74,.72) 100%),url('https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=2400&q=85')",backgroundSize:'cover',backgroundPosition:'center'}}>
        <div style={{position:'relative',zIndex:1,minHeight:360,display:'flex',alignItems:'center',padding:'42px clamp(24px,6vw,70px)',color:'#fff'}}>
          <div style={{maxWidth:780}}>
            <div style={{fontSize:13,fontWeight:900,letterSpacing:1.2,textTransform:'uppercase',opacity:.86}}>CareerDev Global • AI & Automation</div>
            <h1 style={{fontSize:'clamp(2.3rem,5vw,4rem)',lineHeight:1.05,margin:'12px 0 14px'}}>CareerDev AI Agent Pricing</h1>
            <p style={{fontSize:'clamp(1rem,2vw,1.2rem)',lineHeight:1.65,margin:0,maxWidth:700,color:'rgba(255,255,255,.9)'}}>Choose a subscription for the 16 Client & Coach AI Agents, with a shared Career Intelligence Profile and governed human oversight.</p>
            <p style={{fontWeight:900,margin:'18px 0 0'}}>AI processes. Humans decide.</p>
          </div>
        </div>
      </section>
      <header style={{display:'flex',justifyContent:'space-between',gap:18,alignItems:'center',flexWrap:'wrap',marginBottom:30}}>
        <div><a href="/" style={{color:'#176da9',fontWeight:800,textDecoration:'none'}}>← CareerDev Global</a><p style={{margin:'10px 0 0',color:'#527085',maxWidth:760}}>Flexible access to the CareerDev Global client and coach AI workspace.</p></div>
        <a href="/agents" style={{padding:'11px 15px',border:'1px solid #c8d9e8',borderRadius:10,background:'#fff',color:'#173b59',fontWeight:800,textDecoration:'none'}}>AI Agent Workspace →</a>
      </header>
      <div style={{display:'flex',justifyContent:'center',marginBottom:24}}>
        <div style={{display:'inline-flex',padding:4,borderRadius:999,background:'#fff',border:'1px solid #c8d9e8'}}>
          <button onClick={()=>setInterval('monthly')} style={{border:0,borderRadius:999,padding:'10px 18px',fontWeight:900,background:interval==='monthly'?'#0b5d9b':'transparent',color:interval==='monthly'?'#fff':'#173b59'}}>Monthly</button>
          <button onClick={()=>setInterval('annual')} style={{border:0,borderRadius:999,padding:'10px 18px',fontWeight:900,background:interval==='annual'?'#0b5d9b':'transparent',color:interval==='annual'?'#fff':'#173b59'}}>Annual</button>
        </div>
      </div>
      {message&&<div style={{marginBottom:18,padding:14,borderRadius:12,background:'#fff4e5',border:'1px solid #f0c36a',color:'#684b00'}}>{message}</div>}
      {loading?<p>Loading plans…</p>:<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:16}}>
        {plans.map((p)=>{const price=interval==='monthly'?p.monthly_price:p.annual_price;const popular=p.plan_key==='professional';const isCurrent=currentPlan===p.plan_key;return <article key={p.plan_key} style={{position:'relative',background:'#fff',border:popular?'2px solid #0b5d9b':'1px solid #d8e6f1',borderRadius:18,padding:22,boxShadow:'0 10px 30px rgba(0,60,100,.07)'}}>
          {popular&&<span style={{position:'absolute',top:-12,left:18,padding:'5px 10px',borderRadius:999,background:'#0b5d9b',color:'#fff',fontSize:11,fontWeight:900}}>MOST POPULAR</span>}
          <h2 style={{margin:'4px 0 4px'}}>{p.name}</h2><p style={{minHeight:62,color:'#527085',fontSize:14,lineHeight:1.5}}>{p.description}</p>
          <div style={{fontSize:34,fontWeight:900,margin:'14px 0 2px'}}>{'$'+price.toFixed(2)}<span style={{fontSize:14,fontWeight:600,color:'#718394'}}>/{interval==='monthly'?'month':'year'}</span></div>
          <p style={{fontSize:12,color:'#718394',marginTop:0}}>{p.monthly_credits.toLocaleString()} AI credits/month allowance</p>
          <div style={{fontSize:13,lineHeight:1.8,minHeight:125}}><strong>{p.included_agents.length} of 16 agents</strong><br/>{p.included_agents.slice(0,6).map(k=><div key={k}>✓ {k.replace(/_agent$/,'').replaceAll('_',' ')}</div>)}{p.included_agents.length>6&&<div>+ {p.included_agents.length-6} more agents</div>}</div>
          <button disabled={busy!==null||isCurrent} onClick={()=>subscribe(p.plan_key)} style={{width:'100%',marginTop:14,padding:'12px 14px',border:0,borderRadius:10,background:isCurrent?'#e8eef3':'#0b5d9b',color:isCurrent?'#527085':'#fff',fontWeight:900,cursor:isCurrent?'default':'pointer'}}>{isCurrent?'Current Plan':busy===p.plan_key?'Preparing secure checkout…':'Choose '+p.name}</button>
        </article>})}
      </div>}
      <section style={{marginTop:28,background:'#fff',border:'1px solid #d8e6f1',borderRadius:16,padding:20}}>
        <h2 style={{marginTop:0}}>How access works</h2>
        <p style={{color:'#527085',lineHeight:1.6}}>Your active subscription controls which of the 16 Client & Coach AI Agents can be opened in the AI Agent Workspace. The platform keeps the internal/admin agents separate from these customer plans.</p>
        <p style={{color:'#527085',lineHeight:1.6}}>Subscriptions are processed securely through Paystack. Payment status is verified server-side before AI Agent access is activated.</p>
      </section>
    </div>
  </main>
}
