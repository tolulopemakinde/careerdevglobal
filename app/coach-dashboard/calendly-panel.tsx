'use client';
import {useEffect,useState} from 'react';
import {createSupabaseBrowserClient} from '../../lib/supabase-browser';

export default function CalendlyPanel(){
  const supabase=createSupabaseBrowserClient();
  const[calendly,setCalendly]=useState<any>(null);
  const[busy,setBusy]=useState(false);
  const[message,setMessage]=useState('');

  async function call(body:any){
    const{data,error}=await supabase.functions.invoke('careerdev-calendly-oauth',{body});
    if(error)throw new Error(error.message);
    return data;
  }

  async function load(){
    try{
      setMessage('');
      const data=await call({action:'status'});
      setCalendly(data);
    }catch(e:any){
      setMessage(e.message||'Unable to load Calendly status.');
    }
  }

  useEffect(()=>{load()},[]);

  async function connect(){
    setBusy(true);setMessage('');
    try{
      const data=await call({action:'authorize'});
      if(data?.authorization_url)window.location.assign(data.authorization_url);
      else setMessage('Calendly authorization URL was not returned.');
    }catch(e:any){
      setMessage(e.message||'Unable to connect Calendly.');
    }finally{
      setBusy(false);
    }
  }

  async function disconnect(){
    setBusy(true);setMessage('');
    try{
      await call({action:'disconnect'});
      setCalendly(null);
      setMessage('Calendly disconnected.');
    }catch(e:any){
      setMessage(e.message||'Unable to disconnect Calendly.');
    }finally{
      setBusy(false);
    }
  }

  async function refresh(){
    setBusy(true);
    try{
      await load();
      setMessage('Calendly connection refreshed.');
    }finally{
      setBusy(false);
    }
  }

  return <section className="dash-card">
    <h2>Calendly scheduling</h2>
    <p className="note">Connect the coach’s own Calendly account so CareerDev Global can use the coach’s Calendly availability and notifications.</p>
    {message&&<div className="dash-message">{message}</div>}
    {calendly?.connected?
      <>
        <div className="status-grid">
          <div><small>Connected account</small><strong>{calendly.connection?.calendly_user_email||'Connected'}</strong></div>
          <div><small>Calendly name</small><strong>{calendly.connection?.calendly_user_name||'—'}</strong></div>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}>
          <button onClick={refresh} disabled={busy}>Refresh</button>
          <button className="secondary" onClick={disconnect} disabled={busy}>Disconnect</button>
        </div>
      </>
      :
      <button onClick={connect} disabled={busy}>{busy?'Connecting…':'Connect Calendly'}</button>
    }
  </section>;
}
