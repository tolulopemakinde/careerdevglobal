'use client';

import {useEffect,useState} from 'react';
import {createSupabaseBrowserClient} from '../../lib/supabase-browser';
import './styles.css';

type PaymentStatus={
 transaction_id?:string; booking_id?:string; gross_amount?:number; currency?:string; payment_status?:string; fulfillment_status?:string; release_eligibility?:string; provider_key?:string|null; provider_payment_reference?:string|null; payment_intent_id?:string|null; payment_intent_status?:string|null;
};

export default function ClientDashboard(){
 const supabase=createSupabaseBrowserClient();
 const [user,setUser]=useState<any>(null);
 const [bookings,setBookings]=useState<any[]>([]);
 const [payments,setPayments]=useState<Record<string,PaymentStatus>>({});
 const [message,setMessage]=useState('');
 const [loading,setLoading]=useState(true);
 const [paymentBusy,setPaymentBusy]=useState<string|null>(null);
 async function load(){
  const {data:{user}}=await supabase.auth.getUser(); setUser(user);
  if(!user){setLoading(false);return;}
  const {data,error}=await supabase.from('client_marketplace_upcoming_bookings').select('*').order('requested_start',{ascending:true});
  if(error)setMessage(error.message);
  const rows=data??[]; setBookings(rows);
  const entries=await Promise.all(rows.map(async b=>{const {data:payment}=await supabase.rpc('get_my_marketplace_payment_status',{p_booking_id:b.id});return [b.id,Array.isArray(payment)?(payment[0]??{}):{}] as const;}));
  setPayments(Object.fromEntries(entries)); setLoading(false);
 }
 useEffect(()=>{load()},[]);
 async function cancel(id:string){
  const reason=window.prompt('Reason for cancelling this booking request (optional):')||null;
  if(reason===null&&!window.confirm('Cancel this booking request?'))return;
  setMessage(''); const {error}=await supabase.rpc('cancel_marketplace_booking',{p_booking_id:id,p_reason:reason});
  if(error)setMessage(error.message);else{setMessage('Booking cancelled.');await load()}
 }
 async function preparePayment(bookingId:string){
  setPaymentBusy(bookingId);setMessage('');
  const idempotency_key=`cdg-${bookingId}-${crypto.randomUUID()}`;
  const {data,error}=await supabase.functions.invoke('careerdev-marketplace-payments',{body:{booking_id:bookingId,idempotency_key}});
  setPaymentBusy(null);
  if(error){setMessage(error.message);return;}
  const checkoutUrl=data?.checkout_url??data?.authorization_url;
  if(typeof checkoutUrl==='string'&&checkoutUrl){window.location.assign(checkoutUrl);return;}
  setMessage(data?.message||'Payment is not yet configured for this booking.');
 }
 if(loading)return <main className="client-dash"><div className="dash-card"><p>Loading your bookings…</p></div></main>;
 if(!user)return <main className="client-dash"><div className="dash-card"><h1>Client dashboard</h1><p>Please sign in to view and manage your coaching bookings.</p><a href="/login?next=/client-dashboard">Sign in →</a></div></main>;
 return <main className="client-dash"><div className="dash-wrap"><header><a href="/coach-matching">← Coach matching</a><span>CareerDev Global · Client dashboard</span></header><section className="dash-hero"><p>COACHING MARKETPLACE</p><h1>Your coaching sessions</h1><p>Track requests, confirmed sessions and payment readiness in one place.</p></section>{message&&<div className="dash-message">{message}</div>}<section className="dash-card"><h2>Upcoming bookings</h2>{bookings.length===0?<p>You have no upcoming coaching bookings. <a href="/coach-matching">Find a coach →</a></p>:<div className="booking-list">{bookings.map(b=>{const p=payments[b.id]||{};const payable=b.booking_status==='confirmed'&&['pending','authorized'].includes(p.payment_status||'');const paid=['paid','captured','settled'].includes(p.payment_status||'');return <article className="booking-card" key={b.id}><div><strong>{b.service_title||'Coaching session'}</strong><p>with {b.coach_display_name}</p><p>{new Date(b.requested_start).toLocaleString()} · {b.timezone}</p><p>{b.duration_minutes} minutes · {b.delivery_mode||'Coaching'}</p>{b.price!=null&&<p>{b.currency} {b.price}</p>}<p>Payment: {paid?'Paid':p.payment_status||'Not yet available'}</p></div><div><span className={`status status-${b.booking_status}`}>{b.booking_status}</span>{payable&&!paid&&<button onClick={()=>preparePayment(b.id)} disabled={paymentBusy===b.id}>{paymentBusy===b.id?'Preparing…':'Pay securely'}</button>}{b.booking_status!=='cancelled'&&<button onClick={()=>cancel(b.id)}>Cancel request</button>}</div></article>})}</div>}</section><section className="dash-card"><h2>What happens next?</h2><ol><li>Your request is sent to the coach.</li><li>The coach confirms the requested time.</li><li>CareerDev notifications and reminders keep both sides informed.</li><li>When an approved payment provider is configured, you will be routed to secure provider checkout.</li></ol></section></div></main>
}
