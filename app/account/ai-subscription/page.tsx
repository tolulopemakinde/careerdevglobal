'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {createSupabaseBrowserClient} from '../../../lib/supabase-browser';
import {BillingPlan,eligibleUpgrade,planPrice} from '../../../lib/ai-billing-plans';
import './billing.css';
type Subscription={id:string;plan_key:string;status:string;billing_interval:string;currency:string;amount:number;current_period_start:string|null;current_period_end:string|null;metadata:{scheduled_upgrade_plan_key?:string|null}};
type Credit={monthly_allowance:number;credits_remaining:number;credits_consumed:number;credits_reserved:number;period_end:string};
type Payment={paid_at:string;amount_minor:number;currency:string;period_start:string;period_end:string};
const date=(value:string|null)=>value?new Date(value).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}):'Awaiting verification';
const money=(amount:number|string|null,currency:string)=>amount===null?'Unavailable':new Intl.NumberFormat(undefined,{style:'currency',currency}).format(Number(amount));
export default function ManageAiSubscription(){
 const [subscription,setSubscription]=useState<Subscription|null>(null),[plans,setPlans]=useState<BillingPlan[]>([]);
 const [credits,setCredits]=useState<Credit|null>(null),[history,setHistory]=useState<Payment[]>([]);
 const [enabled,setEnabled]=useState(false),[dashboard,setDashboard]=useState('/account');
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(false);
 const [confirmation,setConfirmation]=useState<{action:'cancel'|'upgrade';target?:BillingPlan}|null>(null);
 const dialog=useRef<HTMLDialogElement>(null),inFlight=useRef(false);
 const load=useCallback(async()=>{
  setLoading(true);setLoadError(false);
  try{
   const db=createSupabaseBrowserClient();
   const {data:{user},error:authError}=await db.auth.getUser();
   if(authError||!user){window.location.replace('/account?next=/account/ai-subscription');return}
   const {data:profile,error:profileError}=await db.from('profiles').select('role,status').eq('id',user.id).maybeSingle();
   if(profileError||profile?.status!=='active'||!['client','coach'].includes(profile.role))throw new Error('An active client or coach account is required.');
   setDashboard(profile.role==='coach'?'/coach-dashboard':'/client-dashboard');
   const [sub,available,credit,payments,config]=await Promise.all([
    db.from('ai_agent_subscriptions').select('id,plan_key,status,billing_interval,currency,amount,current_period_start,current_period_end,metadata').eq('user_id',user.id).order('created_at',{ascending:false}).limit(20),
    db.from('ai_agent_subscription_plans').select('plan_key,name,monthly_price,annual_price,monthly_price_ngn,annual_price_ngn,monthly_credits,included_agents').eq('active',true).order('sort_order'),
    db.rpc('get_my_ai_credit_status'),db.rpc('get_my_ai_billing_history'),
    db.from('ai_billing_release_config').select('self_service_enabled').eq('id',true).maybeSingle()
   ]);
   if(sub.error||available.error)throw new Error('Unable to load billing details. Please retry.');
   const rows=(sub.data??[]) as Subscription[],current=rows.filter(row=>['active','attention','non_renewing','pending'].includes(row.status));
   if(current.length>1)throw new Error('Multiple billing records require reconciliation. Contact support before making another payment.');
   setSubscription(current[0]??rows[0]??null);setPlans(available.data as BillingPlan[]);
   setCredits(credit.error?null:credit.data?.[0]??null);setHistory(payments.error?[]:payments.data??[]);
   setEnabled(!config.error&&config.data?.self_service_enabled===true&&!credit.error&&!payments.error);
  }catch(error){setLoadError(true);setEnabled(false);setMessage(error instanceof Error?error.message:'Unable to load billing details.')}
  finally{setLoading(false)}
 },[]);
 useEffect(()=>{void load()},[load]);
 useEffect(()=>{if(confirmation&&!dialog.current?.open)dialog.current?.showModal()},[confirmation]);
 async function perform(){
  if(!confirmation||inFlight.current||!enabled)return;
  inFlight.current=true;setBusy(true);setMessage('');
  try{
   const db=createSupabaseBrowserClient();
   const {data,error}=await db.functions.invoke('careerdev-ai-subscription-manage',{body:{action:confirmation.action,confirmed:true,...(confirmation.target?{plan_key:confirmation.target.plan_key}:{})}});
   if(error||!data?.ok){
    let detail=data?.error;
    if(error?.context){try{detail=(await error.context.json()).error}catch{}}
    throw new Error(detail||'The billing change could not be confirmed. Contact support before making another payment.');
   }
   setMessage(data.upgrade_requires_checkout?'Old renewal stopped. Your current plan remains available until '+date(data.current_period_end)+'. Complete a new checkout for the higher plan after that date; no prorated charge or credit is applied.':'Renewal stopped. Paid access ends '+date(data.current_period_end)+'.');
   dialog.current?.close();setConfirmation(null);await load();
  }catch(error){setMessage(error instanceof Error?error.message:'Billing reconciliation is pending.')}
  finally{inFlight.current=false;setBusy(false)}
 }
 const current=plans.find(p=>p.plan_key===subscription?.plan_key);
 const end=subscription?.current_period_end,paid=!!end&&Date.parse(end)>Date.now()&&!!subscription?.current_period_start&&Date.parse(subscription.current_period_start)<=Date.now();
 const canChange=enabled&&!loadError&&!!subscription&&['active','attention','non_renewing'].includes(subscription.status);
 return <main className="ai-billing-page" style={{maxWidth:960,margin:'32px auto',padding:24,color:'#09233f'}}>
  <Link href={dashboard}>← Dashboard</Link><h1 style={{color:'#09233f',fontSize:'clamp(1.8rem,4vw,2.6rem)',lineHeight:1.15,margin:'20px 0'}}>Manage AI Subscription</h1>
  {message&&<p role="status" aria-live="polite">{message}</p>}
  {loading?<p role="status">Loading billing details…</p>:loadError?<button onClick={()=>{setMessage('');void load()}}>Retry loading</button>:<>
   {!enabled&&<p>Self-service billing changes are awaiting verification. <Link href="/support">Contact billing support</Link> for help.</p>}
   {!subscription?<><p>No subscription found.</p><Link href="/pricing">View available plans</Link></>:<>
    <section style={{border:'1px solid #c8d9e8',borderRadius:16,padding:24}}>
     <h2>{current?.name??subscription.plan_key}</h2>
     <p>Status: <strong>{subscription.status.replaceAll('_',' ')}</strong>{!paid&&subscription.status!=='pending'?' — paid access has ended':''}</p>
     <p>{money(subscription.amount,subscription.currency)} / {subscription.billing_interval==='annual'?'year':'month'}</p>
     <p>Paid through: {date(end??null)}</p>
     <p>Next renewal: {subscription.status==='non_renewing'||subscription.status==='cancelled'||subscription.status==='expired'?'Automatic renewal stopped':date(end??null)}</p>
     <p>{current?.monthly_credits??0} credits included per month, including annual plans.</p>
     {credits?<p>{credits.credits_remaining} remaining · {credits.credits_consumed} used · {credits.credits_reserved} reserved</p>:<p>Credit balance is awaiting verification.</p>}
     {!!current&&<details><summary>Included agents</summary><ul>{current.included_agents.map(agent=><li key={agent}>{agent.replace(/_agent$/,'').replaceAll('_',' ')}</li>)}</ul><p>Agent availability follows the current pilot configuration.</p></details>}
     {subscription.metadata?.scheduled_upgrade_plan_key&&<p>Requested upgrade: {plans.find(p=>p.plan_key===subscription.metadata.scheduled_upgrade_plan_key)?.name??subscription.metadata.scheduled_upgrade_plan_key}. Complete payment after the paid-through date.</p>}
     {canChange&&subscription.status!=='non_renewing'&&<button disabled={busy} onClick={()=>setConfirmation({action:'cancel'})}>Cancel Subscription</button>}
     {subscription.status==='non_renewing'&&<p>Future renewals are disabled. Your verified paid benefits remain until expiry.</p>}
    </section>
    <h2>Available upgrades</h2>
    <p>A replacement upgrade stops your current renewal. Keep using your paid plan until it ends, then complete a new checkout. The higher plan activates after verified payment. There is no automatic charge, proration, or unused-credit transfer.</p>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:16}}>
     {plans.filter(plan=>current&&eligibleUpgrade(current,plan,subscription.billing_interval,subscription.currency)).map(plan=><article key={plan.plan_key} style={{border:'1px solid #c8d9e8',borderRadius:12,padding:20}}>
      <h3>{plan.name}</h3><p>{money(planPrice(plan,subscription.billing_interval,subscription.currency),subscription.currency)} / {subscription.billing_interval==='annual'?'year':'month'}</p>
      <p>{plan.monthly_credits} credits/month · {plan.included_agents.length} included agents</p>
      <button disabled={!canChange||busy} onClick={()=>setConfirmation({action:'upgrade',target:plan})}>Plan upgrade after current term</button>
     </article>)}
    </div>
    {subscription.status==='non_renewing'&&!paid&&<p><Link href="/pricing">Complete replacement subscription checkout</Link></p>}
   </>}
   <h2>Verified payment history</h2>
   {history.length?<ul>{history.map((p,index)=><li key={p.paid_at+index}>{date(p.paid_at)} — {money(p.amount_minor/100,p.currency)} · paid through {date(p.period_end)}</li>)}</ul>:<p>No reconciled payments are available here. Contact support for historical billing records.</p>}
   <p><Link href="/pricing">View all plans</Link> · <Link href="/support">Billing support</Link></p>
  </>}
  <dialog ref={dialog} onCancel={event=>{if(busy)event.preventDefault();else setConfirmation(null)}} onClose={()=>{if(!busy)setConfirmation(null)}} aria-labelledby="billing-confirm-title" style={{maxWidth:520,width:'calc(100% - 48px)',border:'1px solid #c8d9e8',borderRadius:16,padding:24}}>
   <h2 id="billing-confirm-title">{confirmation?.action==='upgrade'?'Plan upgrade to '+confirmation.target?.name:'Cancel future renewals?'}</h2>
   <p>Automatic renewal of your current subscription will stop. Verified paid access remains until {date(end??null)}.</p>
   {confirmation?.action==='upgrade'&&<p>You must complete a separate checkout after this date at {money(planPrice(confirmation.target!,subscription?.billing_interval??'monthly',subscription?.currency??'USD'),subscription?.currency??'USD')}. Your plan and credits change only after verified payment. No prorated charge or credit transfer applies.</p>}
   <button disabled={busy} onClick={()=>{dialog.current?.close();setConfirmation(null)}}>Keep current settings</button>{' '}
   <button disabled={busy} onClick={()=>void perform()}>{busy?'Confirming…':confirmation?.action==='upgrade'?'Confirm replacement upgrade':'Confirm cancellation'}</button>
  </dialog>
 </main>
}
