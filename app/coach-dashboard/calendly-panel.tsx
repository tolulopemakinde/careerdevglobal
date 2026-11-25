'use client';
import {useEffect,useState} from 'react';
import {createSupabaseBrowserClient} from '../../lib/supabase-browser';

export default function CalendlyPanel({offerings=[],userId,onMapped}:any){
  const supabase=createSupabaseBrowserClient();
  const calendlyOfferings=offerings.filter((o:any)=>String(o.title||'').trim().toLowerCase()!=='linkedin profile optimization');
  const[calendly,setCalendly]=useState<any>(null);
  const[eventTypes,setEventTypes]=useState<any[]>([]);
  const[busy,setBusy]=useState(false);
  const[message,setMessage]=useState('');
  const[bookingUrlDrafts,setBookingUrlDrafts]=useState<Record<string,string>>({});

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

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const result=params.get('calendly');
    if(result==='connected') setMessage('Calendly connected successfully.');
    if(result==='error') setMessage('Calendly connection failed. Check the Calendly OAuth app redirect URI and permissions, then try again.');
    if(result==='expired') setMessage('Calendly authorization expired before it could be completed. Please reconnect.');
    void load();
  },[]);

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

  function normalizeBookingUrl(value:string){
    if(!value.trim())return '';
    try{
      const url=new URL(value.trim());
      const host=url.hostname.toLowerCase();
      if(url.protocol!=='https:'||(host!=='calendly.com'&&!host.endsWith('.calendly.com'))||url.username||url.password||url.hash||url.pathname==='/')return null;
      return url.href;
    }catch{return null}
  }

  useEffect(()=>{
    setBookingUrlDrafts(Object.fromEntries(calendlyOfferings.map((o:any)=>[o.id,o.calendly_booking_url||''])));
  },[offerings]);

  async function saveBookingUrl(o:any){
    const raw=bookingUrlDrafts[o.id]??'';
    const normalized=normalizeBookingUrl(raw);
    if(normalized===null){
      setMessage('Enter a full HTTPS Calendly scheduling link, from your own Calendly account.');
      return;
    }
    setBusy(true);setMessage('');
    try{
      const{error}=await supabase.from('coach_service_offerings').update({calendly_booking_url:normalized||null}).eq('id',o.id);
      if(error)setMessage(error.message);
      else{setMessage(normalized?'Direct Calendly booking link saved.':'Direct Calendly booking link removed.');onMapped?.()}
    }finally{setBusy(false)}
  }

  return <section id="calendly" tabIndex={-1} className="dash-card">
    <h2>Calendly scheduling</h2>
    <p className="note">Connect your Calendly account for each service so clients can schedule on Calendly. The meeting platform is inherited from each linked Calendly event type, so you can use Zoom, Google Meet, Microsoft Teams, phone, in-person, or another Calendly-supported location.</p>
    {message&&<div className="dash-message">{message}</div>}
    <div className="calendly-link-fallback" style={{marginTop:16}}>
      {calendlyOfferings.length===0?<p className="note">Publish a service offering first.</p>:calendlyOfferings.map((o:any)=><div key={o.id} style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:10,alignItems:'end',marginTop:12}}>
        <label><strong>{o.title}</strong><input type="url" inputMode="url" autoComplete="url" placeholder="Optional: paste your actual Calendly event link" value={bookingUrlDrafts[o.id]??o.calendly_booking_url??''} onChange={e=>setBookingUrlDrafts(current=>({...current,[o.id]:e.target.value}))}/></label>
        <button className="secondary" onClick={()=>saveBookingUrl(o)} disabled={busy}>Save link</button>
      </div>)}
    </div>
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
          {calendlyOfferings.length===0?<p className="note">Publish a service offering first.</p>:
            calendlyOfferings.map((o:any)=><label key={o.id} style={{display:'block',marginTop:10}}>
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
