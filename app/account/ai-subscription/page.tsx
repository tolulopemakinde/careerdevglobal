'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '../../../lib/supabase-browser';

type Subscription = { plan_key:string; status:string; billing_interval:string; currency:string; amount:number; current_period_end:string|null };
type Plan = { plan_key:string; name:string; monthly_price:number; annual_price:number; monthly_price_ngn:number; annual_price_ngn:number; monthly_credits:number };
export default function ManageAiSubscription(){
 const [subscription,setSubscription]=useState<Subscription|null>(null);
 const [plans,setPlans]=useState<Plan[]>([]);
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 useEffect(()=>{void (async()=>{
  const db=createSupabaseBrowserClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user){window.location.replace('/account');return;}
  const [sub,available]=await Promise.all([
   db.rpc('get_my_ai_subscription'),
   db.from('ai_agent_subscription_plans').select('plan_key,name,monthly_price,annual_price,monthly_price_ngn,annual_price_ngn,monthly_credits').eq('active',true).order('sort_order')
  ]);
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
 return <main style={{maxWidth:860,margin:'40px auto',padding:'24px',color:'#09233f'}}>
  <Link href="/client-dashboard">← Dashboard</Link>
  <h1>Manage AI Subscription</h1>
  {loading?<p>Loading subscription…</p>:!subscription?<><p>No current AI subscription was found.</p><Link href="/pricing">Explore plans</Link></>:<>
   <section style={{border:'1px solid #c8d9e8',borderRadius:16,padding:24,marginBottom:24}}>
    <h2>{current?.name||subscription.plan_key}</h2>
    <p>Status: <strong>{subscription.status}</strong></p>
    <p>Billing: {subscription.billing_interval} • {subscription.currency} {subscription.amount}</p>
    <p>Current period ends: {subscription.current_period_end?new Date(subscription.current_period_end).toLocaleDateString():'Not yet confirmed'}</p>
    {subscription.status==='active'&&<button disabled={busy} onClick={cancel} style={{padding:'12px 16px',borderRadius:8,cursor:'pointer'}}>{busy?'Processing…':'Cancel future renewals'}</button>}
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
 </main>
}