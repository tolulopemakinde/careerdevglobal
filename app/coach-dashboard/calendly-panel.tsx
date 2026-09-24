'use client';
import {useEffect,useState} from 'react';
import {createSupabaseBrowserClient} from '../../lib/supabase-browser';

export default function CalendlyPanel({offerings=[],userId,onMapped}:any){
  const supabase=createSupabaseBrowserClient();
  const[calendly,setCalendly]=useState<any>(null);
  const[eventTypes,setEventTypes]=useState<any[]>([]);
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
      if(data?.connected){
        const{data:eventData,error}=await supabase.functions.invoke('careerdev-calendly-booking',{body:{action:'event_types'}});
        if(error)throw new Error(error.message);
        setEventTypes(eventData?.event_types||[]);
      }else setEventTypes([]);
    }catch(e:any){
      setMessage(e.message||'Unable to load Calendly status.');
    }
  }

  useEffect(()=>{void load()},[]);

  async function connect(){
    setBusy(true);setMessage('');
    try{
      const data=await call({action:'authorize'});
      if(data?.authorization_url)window.location.assign(data.authorization_url);
      else setMessage('Calendly authorization URL was not returned.');
    }catch(e:any){
      setMessage(e.message||'Unable to connect Calendly.');
    }finally{setBusy(false)}
  }

  async function disconnect(){
    setBusy(true);setMessage('');
    try{
      await call({action:'disconnect'});
      setCalendly(null);setEventTypes([]);
      setMessage('Calendly disconnected.');
    }catch(e:any){
      setMessage(e.message||'Unable to disconnect Calendly.');
    }finally{setBusy(false)}
  }

  async function refresh(){
    setBusy(true);
    try{await load();setMessage('Calendly connection refreshed.')}
    finally{setBusy(false)}
  }

  async function mapOffering(id:string,value:string){
    setMessage('');
    const{error}=await supabase.from('coach_service_offerings').update({calendly_event_type_uri:value||null}).eq('id',id);
    if(error)setMessage(error.message);
    else{setMessage('Calendly event type linked.');onMapped?.()}
  }

  return <section className="dash-card">
    <h2>Calendly scheduling</h2>
    <p className="note">Connect the coach’s own Calendly account. The meeting platform is inherited from each linked Calendly event type, so you can use Zoom, Google Meet, Microsoft Teams, phone, in-person or another Calendly-supported location without CareerDev Global forcing a single platform.</p>
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
        <div style={{marginTop:16}}>
          <h3>Service-to-Calendly mapping</h3>
          {offerings.length===0?<p className="note">Publish a service offering first.</p>:
            offerings.map((o:any)=><label key={o.id} style={{display:'block',marginTop:10}}>
              <strong>{o.title}</strong>
              <select value={o.calendly_event_type_uri||''} onChange={e=>mapOffering(o.id,e.target.value)} disabled={busy}>
                <option value="">Not linked</option>
                {eventTypes.map((t:any)=><option value={t.uri} key={t.uri}>{t.name} · {t.duration} min · {(t.locations||[]).map((l:any)=>String(l.kind||'').split('_').join(' ')).join(', ')||'meeting platform configured'}</option>)}
              </select>
            </label>)}
        </div>
      </>
      :
      <button onClick={connect} disabled={busy}>{busy?'Connecting…':'Connect Calendly'}</button>
    }
  </section>;
}
