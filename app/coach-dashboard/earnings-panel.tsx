'use client';
import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '../../lib/supabase-browser';

export default function CoachEarningsPanel(){
 const supabase=createSupabaseBrowserClient();
 const [summary,setSummary]=useState<any>(null); const [account,setAccount]=useState<any>(null); const [message,setMessage]=useState('');
 async function load(){
  const [{data:summaryData,error:summaryError},{data:accountData,error:accountError}]=await Promise.all([
   supabase.rpc('get_my_coach_payout_summary'),
   supabase.from('coach_payout_accounts').select('id,bank_name,account_name,account_number_last4,recipient_code,verification_status,active,updated_at').eq('active',true).maybeSingle()
  ]);
  if(summaryError||accountError)setMessage((summaryError||accountError)?.message||'Unable to load payout information.');
  setSummary(summaryData);setAccount(accountData);
 }
 useEffect(()=>{load()},[]);
 return <section className="dash-card"><h2>Earnings & payouts</h2>
  <div className="status-grid">
   <div><small>Total earned</small><strong>{summary?.total_earned!=null?`${summary.currency||''} ${summary.total_earned}`:'—'}</strong></div>
   <div><small>Coach share</small><strong>70%</strong></div>
   <div><small>Available payout</small><strong>{summary?.available_payout!=null?`${summary.currency||''} ${summary.available_payout}`:'—'}</strong></div>
  </div>
  <p className="note">Marketplace coaching fees use the standard 70:30 revenue share: 70% to the coach and 30% to CareerDev Global, subject to the applicable transaction, refund, chargeback, tax and other disclosed adjustments.</p>
  <div className="payout-account-card">
   <h3>Payout account</h3>
   {account?<p>{account.bank_name||'Verified bank'} · {account.account_name||'Account'} · •••• {account.account_number_last4||'—'} · {account.verification_status||'pending'}</p>:<p>No active payout account is connected yet.</p>}
   <button className="secondary" type="button" onClick={()=>setMessage('Payout-account onboarding will be enabled after the Paystack Transfers business configuration is completed.')}>Manage payout account</button>
  </div>
  {message&&<p className="note">{message}</p>}
 </section>
}
