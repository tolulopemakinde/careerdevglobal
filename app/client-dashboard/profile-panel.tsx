'use client';

import {useEffect,useState} from 'react';
import {createSupabaseBrowserClient} from '../../lib/supabase-browser';
import ProfileAvatarUploader from '../components/profile-avatar-uploader';

type Props={userId:string};
export default function ClientProfilePanel({userId}:Props){
 const supabase=createSupabaseBrowserClient();
 const [profile,setProfile]=useState<any>(null);const [registeredEmail,setRegisteredEmail]=useState('');const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [error,setError]=useState('');
 async function load(){
  const [{data:p,error:pe},{data:{user}}]=await Promise.all([
   supabase.from('profiles').select('full_name,email,phone,country,timezone,bio,linkedin_url,avatar_url').eq('id',userId).maybeSingle(),
   supabase.auth.getUser()
  ]);
  if(pe){setError(pe.message);return}
  const authEmail=user?.email||'';setRegisteredEmail(authEmail);setProfile({...p,email:p?.email||authEmail});
 }
 useEffect(()=>{load()},[userId]);
 function field(k:string,v:string){setProfile((p:any)=>({...p,[k]:v}))}
 async function save(){
  setBusy(true);setMessage('');setError('');
  const email=profile?.email||registeredEmail;
  const {error:e}=await supabase.from('profiles').update({email,full_name:profile.full_name,phone:profile.phone,country:profile.country,timezone:profile.timezone,bio:profile.bio,linkedin_url:profile.linkedin_url}).eq('id',userId);
  if(e){setError(`Could not save your profile: ${e.message}`);setBusy(false);return}
  setMessage('Profile updated successfully.');setBusy(false);await load()
 }
 return <section className="dash-card profile-account-card"><div className="account-heading"><div><p className="section-kicker">YOUR ACCOUNT</p><h2>Profile & profile picture</h2><p className="note">Keep your profile current so coaches have useful context before a session.</p></div><ProfileAvatarUploader userId={userId} avatarUrl={profile?.avatar_url} name={profile?.full_name} size="lg"/></div><div className="form-grid profile-form"><label>Full name<input value={profile?.full_name??''} onChange={e=>field('full_name',e.target.value)}/></label><label>Email<input value={profile?.email||registeredEmail} disabled readOnly/></label><label>Phone<input value={profile?.phone??''} onChange={e=>field('phone',e.target.value)}/></label><label>Country<input value={profile?.country??''} onChange={e=>field('country',e.target.value)}/></label><label>Timezone<input value={profile?.timezone??''} onChange={e=>field('timezone',e.target.value)}/></label><label>LinkedIn<input value={profile?.linkedin_url??''} onChange={e=>field('linkedin_url',e.target.value)}/></label><label className="wide">About you<textarea value={profile?.bio??''} onChange={e=>field('bio',e.target.value)} placeholder="Tell your coach a little about your goals or background."/></label></div>{(message||error)&&<div className={error?'dash-message profile-error':'dash-message'}>{error||message}</div>}<button onClick={save} disabled={busy}>{busy?'Saving…':'Save profile changes'}</button></section>
}
