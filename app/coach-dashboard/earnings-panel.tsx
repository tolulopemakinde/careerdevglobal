'use client';
import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '../../lib/supabase-browser';

type Bank = { name: string; code: string };

export default function CoachEarningsPanel(){
 const supabase=createSupabaseBrowserClient();
 const [summary,setSummary]=useState<any>(null);
 const [account,setAccount]=useState<any>(null);
 const [banks,setBanks]=useState<Bank[]>([]);
 const [bankSearch,setBankSearch]=useState('');
 const [bankCode,setBankCode]=useState('');
 const [accountNumber,setAccountNumber]=useState('');
 const [accountName,setAccountName]=useState('');
 const [showForm,setShowForm]=useState(false);
 const [loadingBanks,setLoadingBanks]=useState(false);
 const [savingAccount,setSavingAccount]=useState(false);
 const [message,setMessage]=useState('');
 const functionUrl=`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/careerdev-coach-payout-recipient`;

 async function load(){
  const [{data:summaryData,error:summaryError},{data:accountData,error:accountError}]=await Promise.all([
   supabase.rpc('get_my_coach_payout_summary'),
   supabase.from('coach_payout_accounts').select('id,bank_code,bank_name,account_name,account_number_last4,recipient_code,verification_status,is_default,updated_at').eq('is_default',true).maybeSingle()
  ]);
  if(summaryError||accountError){setMessage((summaryError||accountError)?.message||'Unable to load payout information.');return;}
  setSummary(Array.isArray(summaryData)?summaryData[0]??null:summaryData??null);
  setAccount(accountData);
  if(accountData){setBankCode(accountData.bank_code||'');setAccountName(accountData.account_name||'');}
 }
 async function openForm(){
  setMessage('');setShowForm(true);if(banks.length)return;setLoadingBanks(true);
  try{
   const {data:{session}}=await supabase.auth.getSession();
   if(!session?.access_token)throw new Error('Your session has expired. Please sign in again.');
   const response=await fetch(functionUrl,{headers:{Authorization:`Bearer ${session.access_token}`}});
   const payload=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(payload.error||payload.message||'Unable to load Nigerian banks.');
   setBanks(Array.isArray(payload.banks)?payload.banks:[]);
   if(!Array.isArray(payload.banks)||payload.banks.length===0)setMessage('No bank list was returned. Please try again.');
  }catch(error:any){setMessage(error?.message||'Unable to load banks.');}finally{setLoadingBanks(false);}
 }
 async function savePayoutAccount(){
  setMessage('');const cleanNumber=accountNumber.replace(/\D/g,'');
  if(!bankCode){setMessage('Select your bank.');return}if(!/^\d{10}$/.test(cleanNumber)){setMessage('Enter a valid 10-digit Nigerian bank account number.');return}if(!accountName.trim()){setMessage('Enter the account name exactly as registered with your bank.');return}
  setSavingAccount(true);
  try{
   const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw new Error('Your session has expired. Please sign in again.');
   const response=await fetch(functionUrl,{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({bank_code:bankCode,account_number:cleanNumber,account_name:accountName.trim()})});
   const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error||payload.message||'Unable to save payout account.');
   setMessage(payload.message||'Payout account verified and connected.');setAccountNumber('');setBankSearch('');setShowForm(false);await load();
  }catch(error:any){setMessage(error?.message||'Unable to save payout account.');}finally{setSavingAccount(false);}
 }
 useEffect(()=>{load()},[]);
 const filteredBanks=useMemo(()=>{const q=bankSearch.trim().toLowerCase();return q?banks.filter(b=>b.name.toLowerCase().includes(q)):banks},[banks,bankSearch]);
 const currency=summary?.payout_currency||'NGN';
 return <section className="dash-card"><h2>Earnings & payouts</h2>
  <div className="status-grid"><div><small>Total earned</small><strong>{summary?.total_earned!=null?`${currency} ${summary.total_earned}`:'—'}</strong></div><div><small>Coach share</small><strong>70%</strong></div><div><small>Total paid</small><strong>{summary?.total_paid!=null?`${currency} ${summary.total_paid}`:'—'}</strong></div><div><small>Pending payout</small><strong>{summary?.pending_payout!=null?`${currency} ${summary.pending_payout}`:'—'}</strong></div></div>
  <p className="note">Marketplace coaching fees use the standard 70:30 revenue share: 70% to the coach and 30% to CareerDev Global, subject to the applicable transaction, refund, chargeback, tax and other disclosed adjustments.</p>
  <div className="payout-account-card"><h3>Payout account</h3>{account?<p>{account.bank_name||'Verified bank'} · {account.account_name||'Account'} · •••• {account.account_number_last4||'—'} · {account.verification_status||'pending'}</p>:<p>No default payout account is connected yet.</p>}<button className="secondary" type="button" onClick={openForm} disabled={loadingBanks}>{loadingBanks?'Loading banks…':account?'Update payout account':'Connect payout account'}</button></div>
  {showForm&&<div className="payout-account-card" style={{marginTop:16}}><h3>Connect Nigerian bank account</h3><p className="note">CareerDev Global sends your bank details securely to Paystack for recipient setup. The full account number is not stored in the CareerDev database; only the last four digits and provider recipient reference are retained.</p><div className="form-grid"><label>Search bank<input value={bankSearch} onChange={e=>setBankSearch(e.target.value)} placeholder="Type your bank name" autoComplete="off"/></label><label>Bank<select value={bankCode} onChange={e=>setBankCode(e.target.value)}><option value="">Select bank</option>{filteredBanks.map(bank=><option key={bank.code} value={bank.code}>{bank.name}</option>)}</select></label><label>Account number<input inputMode="numeric" maxLength={10} value={accountNumber} onChange={e=>setAccountNumber(e.target.value.replace(/\D/g,'').slice(0,10))} placeholder="10-digit account number" autoComplete="off"/></label><label>Account name<input value={accountName} onChange={e=>setAccountName(e.target.value)} placeholder="Name registered with your bank" autoComplete="name"/></label></div><div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:12}}><button type="button" onClick={savePayoutAccount} disabled={savingAccount}>{savingAccount?'Verifying…':'Verify & connect account'}</button><button className="secondary" type="button" onClick={()=>{setShowForm(false);setMessage('')}} disabled={savingAccount}>Cancel</button></div></div>}
  {message&&<p className="note" role="status">{message}</p>}
 </section>
}
