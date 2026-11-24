'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import '../../career-intelligence/styles.css';
import { createSupabaseBrowserClient } from '../../../lib/supabase-browser';

type Subscription = { plan_key:string; status:string; billing_interval:string; currency:string; amount:number; current_period_end:string|null };
type Plan = { plan_key:string; name:string; monthly_price:number; annual_price:number; monthly_price_ngn:number; annual_price_ngn:number; monthly_credits:number };
export default function ManageAiSubscription(){
 const [subscription,setSubscription]=useState<Subscription|null>(null);
 const [plans,setPlans]=useState<Plan[]>([]);
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);
 const cancellationReady=false;
 const [loading,setLoading]=useState(true);
 const [dashboardHref,setDashboardHref]=useState('/account');
 useEffect(()=>{void (async()=>{
  const db=createSupabaseBrowserClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user){window.location.replace('/account');return;}
  const [profile,sub,available]=await Promise.all([
   db.from('profiles').select('role').eq('id',user.id).maybeSingle(),
   db.rpc('get_my_ai_subscription'),
   db.from('ai_agent_subscription_plans').select('plan_key,name,monthly_price,annual_price,monthly_price_ngn,annual_price_ngn,monthly_credits').eq('active',true).order('sort_order')
  ]);
  setDashboardHref(profile.data?.role==='coach'?'/coach-dashboard':profile.data?.role==='client'?'/client-dashboard':'/account');
  if(sub.error)setMessage('Unable to load subscription. Please try again.');
  else setSubscription((Array.isArray(sub.data)?sub.data[0]:null) as Subscription|null);
  setPlans((available.data||[]) as Plan[]);setLoading(false);
 })()},[]);
 async function cancel(){
  if(!window.confirm('Stop future AI subscription renewals? Paid access should remain until the current paid period ends.'))return;
  setBusy(true);setMessage('');
  try{
   const db=createSupabaseBrowserClient();
   const {data,error}=await db.functions.invoke('careerdev-ai-subscription-manage',{body:{action:'cancel'}});
   if(error||!data?.ok)throw new Error(data?.error||error?.message||'Cancellation could not be confirmed.');
   setMessage('Recurring billing disabled. Your existing paid access remains subject to the confirmed billing period.');
   const {data:latest}=await db.rpc('get_my_ai_subscription');
   setSubscription((Array.isArray(latest)?latest[0]:null) as Subscription|null);
  }catch(e){setMessage(e instanceof Error?e.message:'Please try again.')}finally{setBusy(false)}
 }
 const current=plans.find(p=>p.plan_key===subscription?.plan_key);
 return <main className="ci-page ai-subscription-page">
  <nav className="ci-subnav" aria-label="Account navigation">
   <div className="ci-container ci-subnav-inner">
    <span><span className="ci-live-dot"/>CareerDev Global · ACCOUNT</span>
    <div><Link href={dashboardHref}>Dashboard</Link><Link href="/agents">AI Agents</Link></div>
   </div>
  </nav>
  <section className="ci-hero" aria-labelledby="ai-subscription-title">
   <div className="ci-container ci-hero-grid">
    <div>
     <div className="ci-kicker">CAREERDEV GLOBAL · SUBSCRIPTION MANAGEMENT</div>
     <h1 id="ai-subscription-title">Manage your AI subscription.</h1>
     <p>Review your current plan, billing status and access period. Your account keeps plan information and available management options together.</p>
     <div className="ci-hero-actions">
      <Link className="ci-primary" href={dashboardHref}>Return to dashboard</Link>
      <Link className="ci-secondary" href="/agents">Explore AI Agents</Link>
     </div>
     <div className="ci-trust"><span>✓ Plan details</span><span>✓ Billing status</span><span>✓ Access period</span></div>
    </div>
    <aside className="ci-hero-panel" aria-label="Subscription management overview">
     <div className="ci-panel-label">AI SUBSCRIPTION WORKSPACE</div>
     <div className="ci-panel-title">Your plan, clearly managed.</div>
     <div className="ci-journey"><span>Plan</span><b>→</b><span>Billing</span><b>→</b><span>Access</span><b>→</b><span>Options</span></div>
     <div className="ci-panel-metrics"><div><strong>01</strong><small>Review plan</small></div><div><strong>02</strong><small>Check status</small></div><div><strong>03</strong><small>Manage access</small></div></div>
    </aside>
   </div>
  </section>
  <div className="ci-container" style={{padding:'42px 0 76px',color:'#09233f'}}>
  {loading?<p>Loading subscription…</p>:!subscription?<><p>No current AI subscription was found.</p><Link href="/pricing">Explore plans</Link></>:<>
   <section style={{border:'1px solid #c8d9e8',borderRadius:16,padding:24,marginBottom:24}}>
    <h2>{current?.name||subscription.plan_key}</h2>
    <p>Status: <strong>{subscription.status}</strong></p>
    <p>Billing: {subscription.billing_interval} • {subscription.currency} {subscription.amount}</p>
    <p>Current period ends: {subscription.current_period_end?new Date(subscription.current_period_end).toLocaleDateString():'Not yet confirmed'}</p>
    {subscription.status==='active'&&<button disabled={busy||!cancellationReady} onClick={cancel} style={{padding:'12px 16px',borderRadius:8,cursor:'pointer'}}>{busy?'Processing…':'Cancel future renewals (pending verification)'}</button>}
   </section>
   <h2>Available plans</h2>
   <p>Review plan benefits and pricing before requesting a change. Existing subscribers cannot use the new-subscription checkout; an upgrade requires a verified provider-side plan change.</p>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:12}}>
    {plans.map(p=><article key={p.plan_key} style={{border:'1px solid #c8d9e8',padding:16,borderRadius:12}}>
     <h3>{p.name}</h3><p>{p.monthly_credits} credits/month</p>
     <p>{subscription.currency==='NGN'?'₦':'$'}{subscription.currency==='NGN'?p.monthly_price_ngn:p.monthly_price}/month</p>
     {p.plan_key===subscription.plan_key?<strong>Current plan</strong>:<span>Plan changes pending secure billing integration</span>}
    </article>)}
   </div>
  </>}
  {message&&<p role="status" style={{marginTop:20}}>{message}</p>}
  </div>
 </main>
}
