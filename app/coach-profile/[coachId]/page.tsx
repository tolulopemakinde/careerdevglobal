'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '../../../lib/supabase-browser';
import './styles.css';

const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function pad(n:number){return String(n).padStart(2,'0')}
function wallTimeToUtc(date:string,time:string,tz:string){
  const [y,m,d]=date.split('-').map(Number); const [hh,mm]=time.split(':').map(Number);
  let guess = Date.UTC(y,m-1,d,hh,mm);
  for(let i=0;i<3;i++){
    const parts = new Intl.DateTimeFormat('en-US',{timeZone:tz,hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).formatToParts(new Date(guess));
    const get=(k:string)=>Number(parts.find(p=>p.type===k)?.value||0);
    const shown=Date.UTC(get('year'),get('month')-1,get('day'),get('hour')%24,get('minute'));
    guess += Date.UTC(y,m-1,d,hh,mm)-shown;
  }
  return new Date(guess);
}
function localDateString(d:Date){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}

export default function CoachProfilePage(){
 const params=useParams<{coachId:string}>(); const router=useRouter(); const [profile,setProfile]=useState<any>(null); const [loading,setLoading]=useState(true);
 const [selectedOffering,setSelectedOffering]=useState<any>(null); const [date,setDate]=useState(''); const [selectedSlot,setSelectedSlot]=useState<any>(null); const [notes,setNotes]=useState(''); const [message,setMessage]=useState(''); const [submitting,setSubmitting]=useState(false); const [booked,setBooked]=useState<any[]>([]);
 const supabase=createSupabaseBrowserClient();
 useEffect(()=>{(async()=>{try{const {data,error}=await supabase.rpc('get_public_coach_profile',{p_coach_id:params.coachId});if(!error&&data?.coach_id){setProfile(data);setSelectedOffering(data.offerings?.[0]??null)}}finally{setLoading(false)}})()},[params.coachId]);
 const minDate=useMemo(()=>localDateString(new Date()),[]);
 const slots=useMemo(()=>{
   if(!profile||!date||!selectedOffering)return [];
   const weekday=new Date(`${date}T12:00:00`).getDay(); const out:any[]=[];
   for(const a of profile.availability||[]){if(a.day_of_week!==weekday)continue; const tz=a.timezone||profile.timezone||'UTC'; let [sh,sm]=String(a.start_time).slice(0,5).split(':').map(Number); const [eh,em]=String(a.end_time).slice(0,5).split(':').map(Number); const duration=Number(selectedOffering.duration_minutes); let minutes=sh*60+sm; const end=eh*60+em;
     while(minutes+duration<=end){const hh=Math.floor(minutes/60), mm=minutes%60; const start=wallTimeToUtc(date,`${pad(hh)}:${pad(mm)}`,tz); const finish=new Date(start.getTime()+duration*60000); const conflict=(profile._booked||[]).some((b:any)=>b.start_at && start < new Date(b.end_at) && finish > new Date(b.start_at)); if(!conflict && start>new Date()) out.push({start,finish,tz,label:`${new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit',timeZone:tz}).format(start)}–${new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit',timeZone:tz}).format(finish)} (${tz})`}); minutes+=duration; }
   } return out;
 },[profile,date,selectedOffering]);
 async function loadBooked(){const {data}=await supabase.from('marketplace_booking_slots').select('start_at,end_at').eq('coach_id',params.coachId).in('status',['held','booked']);setBooked(data??[]);setProfile((p:any)=>p?{...p,_booked:data??[]}:p)}
 useEffect(()=>{if(params.coachId)loadBooked()},[params.coachId]);
 async function requestBooking(){
   setMessage(''); if(!selectedOffering||!selectedSlot){setMessage('Choose a service and available time first.');return}
   const {data:{user}}=await supabase.auth.getUser(); if(!user){router.push(`/login?next=/coach-profile/${params.coachId}`);return}
   const {data:client}=await supabase.from('clients').select('id').eq('profile_id',user.id).maybeSingle(); if(!client){setMessage('A client account is required before booking. Please complete client onboarding first.');return}
   setSubmitting(true); const {data,error}=await supabase.rpc('create_marketplace_booking_request',{p_client_id:client.id,p_coach_id:params.coachId,p_coach_service_offering_id:selectedOffering.id,p_service_request_id:null,p_start_at:selectedSlot.start.toISOString(),p_end_at:selectedSlot.finish.toISOString(),p_timezone:selectedSlot.tz,p_client_notes:notes||null}); setSubmitting(false);
   if(error){setMessage(error.message);await loadBooked();return} setMessage('Booking request sent. The coach must confirm the requested time.'); setSelectedSlot(null); setNotes(''); await loadBooked();
 }
 if(loading)return <main className="profile-page"><div className="profile-shell"><p>Loading coach profile…</p></div></main>;
 if(!profile)return <main className="profile-page"><div className="profile-shell empty-profile"><h1>Coach profile unavailable</h1><p>This profile is not currently active in the CareerDev marketplace.</p><a href="/coach-matching">← Return to coach matching</a></div></main>;
 return <main className="profile-page"><header className="profile-header"><a href="/coach-matching">← Coach matching</a><a href="/">CareerDev Global</a></header><section className="profile-hero"><div className="avatar-large">{profile.display_name.split(/\s+/).map((x:string)=>x[0]).slice(0,2).join('').toUpperCase()}</div><div><p className="eyebrow">VERIFIED CAREER COACH</p><h1>{profile.display_name}</h1><p className="headline">{profile.headline||profile.professional_title||'Career coach'}</p><p>{profile.country||'Global'}{profile.timezone?` · ${profile.timezone}`:''}</p></div></section><section className="profile-grid"><div><article className="profile-card"><h2>About</h2><p>{profile.bio||profile.professional_bio||'Professional coaching support tailored to your goals.'}</p></article><article className="profile-card"><h2>Specializations</h2><div className="chips">{(profile.specializations||[]).map((x:string)=><span key={x}>{x}</span>)}</div></article><article className="profile-card"><h2>Professional background</h2><p>{profile.professional_bio||'A goal-focused coaching approach designed around the client’s needs and context.'}</p><div className="meta-row"><span>{profile.years_coaching?`${profile.years_coaching} years coaching`:'Verified coach'}</span><span>{(profile.languages||[]).join(' · ')||'Languages available on request'}</span></div></article></div><aside><article className="profile-card"><h2>Coaching formats</h2><div className="chips">{(profile.coaching_formats||[]).map((x:string)=><span key={x}>{x}</span>)}</div><div className="verified">✓ Verified marketplace profile</div></article><article className="profile-card"><h2>Book a coaching session</h2>{profile.offerings?.length?<><label>Service<select value={selectedOffering?.id||''} onChange={e=>{setSelectedOffering(profile.offerings.find((o:any)=>o.id===e.target.value));setSelectedSlot(null)}}>{profile.offerings.map((o:any)=><option value={o.id} key={o.id}>{o.title} · {o.duration_minutes} min{o.price!=null?` · ${o.currency} ${o.price}`:''}</option>)}</select></label><label>Date<input type="date" min={minDate} value={date} onChange={e=>{setDate(e.target.value);setSelectedSlot(null)}}/></label>{date&&<div><strong>Available times</strong><div className="availability-list">{slots.length?slots.map((s:any)=><button className={selectedSlot===s?'booking-slot selected':'booking-slot'} key={s.start.toISOString()} onClick={()=>setSelectedSlot(s)}>{s.label}</button>):<p>No available times on this date. Try another date.</p>}</div></div>}<label>Message (optional)<textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Tell the coach what you would like to work on."/></label>{message&&<div className="dash-message">{message}</div>}<button className="booking-button" disabled={submitting||!selectedSlot} onClick={requestBooking}>{submitting?'Sending request…':'Request this session'}</button><p className="note">Your request is not confirmed until the coach accepts it. Payment is handled separately after booking confirmation.</p></>:<p>This coach has not published a bookable service yet.</p>}</article><article className="profile-card"><h2>Availability</h2>{profile.availability?.length?<div className="availability-list">{profile.availability.map((a:any)=><div key={`${a.day_of_week}-${a.start_time}`}><strong>{days[a.day_of_week]}</strong><span>{String(a.start_time).slice(0,5)}–{String(a.end_time).slice(0,5)} · {a.timezone}</span></div>)}</div>:<p>Availability is currently being updated.</p>}</article><article className="profile-card"><h2>Credentials</h2>{profile.credentials?.length?<ul>{profile.credentials.map((x:string)=><li key={x}>{x}</li>)}</ul>:<p>Credentials available during coach review.</p>}</article></aside></section></main>;
}
