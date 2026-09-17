'use client';

import {useState} from 'react';
import {createSupabaseBrowserClient} from '../../lib/supabase-browser';

type Props={userId:string;avatarUrl?:string|null;name?:string|null;size?:'sm'|'lg'};
export default function ProfileAvatarUploader({userId,avatarUrl,name,size='lg'}:Props){
 const supabase=createSupabaseBrowserClient();const [file,setFile]=useState<File|null>(null);const [url,setUrl]=useState(avatarUrl||'');const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
 const initials=(name||'User').split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase();
 async function upload(){if(!file)return;setBusy(true);setMessage('');if(file.size>5*1024*1024){setMessage('Use an image up to 5 MB.');setBusy(false);return}if(!['image/jpeg','image/png','image/webp'].includes(file.type)){setMessage('Use JPG, PNG, or WEBP.');setBusy(false);return}const path=`${userId}/${crypto.randomUUID()}-${file.name.toLowerCase().replace(/[^a-z0-9._-]+/g,'-')}`;const {error}=await supabase.storage.from('avatars').upload(path,file,{contentType:file.type,upsert:false});if(error){setMessage(error.message);setBusy(false);return}const {data:{publicUrl}}=supabase.storage.from('avatars').getPublicUrl(path);const {error:pe}=await supabase.from('profiles').update({avatar_url:publicUrl}).eq('id',userId);if(pe){await supabase.storage.from('avatars').remove([path]);setMessage(pe.message);setBusy(false);return}setUrl(`${publicUrl}?v=${Date.now()}`);setFile(null);setMessage('Profile picture updated.');setBusy(false)}
 return <div className={`avatar-uploader avatar-${size}`}><div className="avatar-preview">{url?<img src={url} alt="Profile picture"/>:<span>{initials}</span>}</div><div className="avatar-copy"><strong>Profile picture</strong><small>JPG, PNG or WEBP · max 5 MB</small><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setFile(e.target.files?.[0]??null)}/><button type="button" onClick={upload} disabled={!file||busy}>{busy?'Uploading…':'Upload picture'}</button>{message&&<small>{message}</small>}</div></div>
}
