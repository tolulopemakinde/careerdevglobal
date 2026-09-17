'use client';

import {useEffect,useState} from 'react';
import {createSupabaseBrowserClient} from '../../lib/supabase-browser';

type Props={userId:string;avatarUrl?:string|null;name?:string|null;size?:'sm'|'lg'};

export default function ProfileAvatarUploader({userId,avatarUrl,name,size='lg'}:Props){
 const supabase=createSupabaseBrowserClient();
 const [file,setFile]=useState<File|null>(null);
 const [url,setUrl]=useState(avatarUrl||'');
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const initials=(name||'User').split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase();
 useEffect(()=>{setUrl(avatarUrl||'')},[avatarUrl]);

 async function upload(){
  if(!file)return;
  setBusy(true);setMessage('');
  if(file.size>5*1024*1024){setMessage('Use an image up to 5 MB.');setBusy(false);return}
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)){setMessage('Use JPG, PNG or WEBP.');setBusy(false);return}

  const safeName=file.name.toLowerCase().replace(/[^a-z0-9._-]+/g,'-');
  const path=`${userId}/${crypto.randomUUID()}-${safeName}`;
  const {error:uploadError}=await supabase.storage.from('avatars').upload(path,file,{contentType:file.type,upsert:false});
  if(uploadError){setMessage(`Upload failed: ${uploadError.message}`);setBusy(false);return}

  const {data:{publicUrl}}=supabase.storage.from('avatars').getPublicUrl(path);

  // Update the existing profile instead of upserting a partial row. This avoids
  // violating profiles.full_name NOT NULL when a client profile already exists
  // only in the account/onboarding flow.
  const {data:updated,error:updateError}=await supabase
   .from('profiles')
   .update({avatar_url:publicUrl})
   .eq('id',userId)
   .select('avatar_url')
   .maybeSingle();

  if(updateError){
   await supabase.storage.from('avatars').remove([path]);
   setMessage(`Could not save your profile picture: ${updateError.message}`);
   setBusy(false);return;
  }

  let savedUrl=updated?.avatar_url||'';
  if(!savedUrl){
   // Recovery for accounts that reached the dashboard before their profile row
   // was created. Auth email is the source of truth for the registered email.
   const {data:{user}}=await supabase.auth.getUser();
   const fullName=(name||user?.user_metadata?.full_name||user?.email?.split('@')[0]||'CareerDev User').trim();
   const {data:created,error:createError}=await supabase
    .from('profiles')
    .insert({id:userId,full_name:fullName,email:user?.email||null,avatar_url:publicUrl})
    .select('avatar_url')
    .single();
   if(createError||!created){
    await supabase.storage.from('avatars').remove([path]);
    setMessage(`Could not save your profile picture${createError?`: ${createError.message}`:''}.`);
    setBusy(false);return;
   }
   savedUrl=created.avatar_url||publicUrl;
  }

  setUrl(`${savedUrl}?v=${Date.now()}`);
  setFile(null);
  setMessage('Profile picture saved successfully.');
  setBusy(false);
 }

 return <div className={`avatar-uploader avatar-${size}`}>
  <div className="avatar-preview">{url?<img src={`${url}${url.includes('?')?'&':'?'}v=avatar`} alt="Profile picture"/>:<span>{initials}</span>}</div>
  <div className="avatar-copy">
   <strong>Profile picture</strong>
   <small>JPG, PNG or WEBP · max 5 MB</small>
   <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{setFile(e.target.files?.[0]??null);setMessage('')}}/>
   <button type="button" onClick={upload} disabled={!file||busy}>{busy?'Saving…':'Save profile picture'}</button>
   {message&&<small role="status">{message}</small>}
  </div>
 </div>
}
