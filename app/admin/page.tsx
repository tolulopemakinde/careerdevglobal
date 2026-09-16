'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '../../lib/supabase-browser';

type ProfileRow={id:string;role:string;full_name:string|null;email:string|null;status:string|null;country:string|null;created_at:string};
type Dashboard={counts:Record<string,number>;profiles:ProfileRow[];permissions:Record<string,string[]>};

const roleLabels:{[key:string]:string}={admin:'Administrator',staff:'Staff',coach:'Coach',client:'Client'};

export default function AdminPage(){
 const supabase=createSupabaseBrowserClient();
 const [dashboard,setDashboard]=useState<Dashboard|null>(null);
 const [role,setRole]=useState<string>('');
 const [loading,setLoading]=useState(true);
 const [message,setMessage]=useState('');
 const [busyUser,setBusyUser]=useState<string|null>(null);

 async function load(){
  setLoading(true);setMessage('');
  const {data:userData,error:userError}=await supabase.auth.getUser();
  if(userError||!userData.user){setMessage('Please sign in to access administration.');setLoading(false);return;}
  const {data,error}=await supabase.rpc('admin_get_platform_dashboard');
  if(error){setMessage(error.message);setLoading(false);return;}
  const d=data as Dashboard;setDashboard(d);
  const me=d.profiles.find(p=>p.id===userData.user.id);setRole(me?.role||'');
  setLoading(false);
 }
 useEffect(()=>{load()},[]);

 async function changeRole(userId:string,nextRole:string){
  setBusyUser(userId);setMessage('');
  const {error}=await supabase.rpc('admin_set_user_role',{p_user_id:userId,p_role:nextRole});
  if(error)setMessage(error.message);else setMessage('User role updated successfully.');
  setBusyUser(null);await load();
 }

 const c=dashboard?.counts||{};
 const cards=[['Total users',c.users],['Clients',c.clients],['Coaches',c.coaches],['Staff',c.staff],['Administrators',c.admins],['Active coaches',c.active_coaches],['Coach applications',c.coach_applications],['Active services',c.active_services],['Bookings',c.bookings],['Transactions',c.transactions]];

 return <main style={{minHeight:'100vh',background:'#eef7ff',color:'#09233f',padding:'36px 20px'}}>
  <div style={{maxWidth:1240,margin:'0 auto'}}>
   <div style={{display:'flex',justifyContent:'space-between',gap:20,alignItems:'flex-start',flexWrap:'wrap'}}>
    <div><div style={{fontWeight:800,letterSpacing:'.08em',textTransform:'uppercase',color:'#1671b9'}}>CareerDev Global</div><h1 style={{fontSize:'clamp(2rem,5vw,3.4rem)',margin:'8px 0'}}>Platform Administration</h1><p style={{maxWidth:760,lineHeight:1.7,margin:0}}>Central administration for clients, coaches, staff, administrators, marketplace operations and platform permissions.</p></div>
    <a href="/coach-admin" style={{display:'inline-block',padding:'11px 16px',borderRadius:10,background:'#0b5d9b',color:'#fff',textDecoration:'none',fontWeight:800}}>Coach Marketplace Review →</a>
   </div>

   {message&&<div style={{marginTop:20,padding:14,borderRadius:10,background:'#fff',border:'1px solid #c8d9e8',overflowWrap:'anywhere'}}>{message}</div>}
   {loading?<p style={{marginTop:30}}>Loading administration data…</p>:!dashboard?<p style={{marginTop:30}}>Administration data is unavailable.</p>:<>
    <section style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:12,margin:'28px 0'}}>{cards.map(([label,value])=><div key={String(label)} style={{background:'#fff',borderRadius:14,padding:'17px 18px',border:'1px solid #d8e6f1'}}><div style={{fontSize:12,color:'#5b7184'}}>{label}</div><strong style={{fontSize:27}}>{value??0}</strong></div>)}</section>

    <section style={{display:'grid',gridTemplateColumns:'minmax(0,2fr) minmax(280px,1fr)',gap:18,alignItems:'start'}}>
     <div style={{background:'#fff',borderRadius:16,padding:22,border:'1px solid #d8e6f1',overflowX:'auto'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,marginBottom:16}}><div><h2 style={{margin:'0 0 4px'}}>Users &amp; roles</h2><p style={{margin:0,color:'#617487'}}>Role changes are server-authorized. Administrators cannot change their own role.</p></div><button onClick={load} style={{border:'1px solid #c8d9e8',borderRadius:9,padding:'9px 13px',background:'#fff',fontWeight:700}}>Refresh</button></div>
      <table style={{width:'100%',borderCollapse:'collapse',minWidth:720}}><thead><tr>{['User','Role','Status','Country','Joined','Action'].map(h=><th key={h} style={{textAlign:'left',padding:'11px 8px',borderBottom:'1px solid #dbe6ef',fontSize:12,color:'#607487'}}>{h}</th>)}</tr></thead><tbody>{dashboard.profiles.map(p=><tr key={p.id}><td style={{padding:'13px 8px',borderBottom:'1px solid #edf2f6'}}><strong>{p.full_name||'Unnamed user'}</strong><div style={{fontSize:12,color:'#617487'}}>{p.email||'No email'}</div></td><td style={{padding:'13px 8px',borderBottom:'1px solid #edf2f6'}}><span style={{fontWeight:800}}>{roleLabels[p.role]||p.role}</span></td><td style={{padding:'13px 8px',borderBottom:'1px solid #edf2f6'}}>{p.status||'—'}</td><td style={{padding:'13px 8px',borderBottom:'1px solid #edf2f6'}}>{p.country||'—'}</td><td style={{padding:'13px 8px',borderBottom:'1px solid #edf2f6'}}>{new Date(p.created_at).toLocaleDateString()}</td><td style={{padding:'13px 8px',borderBottom:'1px solid #edf2f6'}}>{role==='admin'&&p.id!==dashboard.profiles.find(x=>x.role===role)?.id?<select value={p.role} disabled={busyUser===p.id} onChange={e=>changeRole(p.id,e.target.value)} style={{padding:'8px',borderRadius:8,border:'1px solid #c8d9e8'}}><option value="client">Client</option><option value="coach">Coach</option><option value="staff">Staff</option><option value="admin">Administrator</option></select>:<span style={{fontSize:12,color:'#718394'}}>Read-only</span>}</td></tr>)}</tbody></table>
     </div>

     <aside style={{background:'#fff',borderRadius:16,padding:22,border:'1px solid #d8e6f1'}}><h2 style={{marginTop:0}}>Role permissions</h2>{Object.entries(dashboard.permissions).map(([r,permissions])=><div key={r} style={{marginBottom:20}}><strong>{roleLabels[r]||r}</strong><ul style={{margin:'8px 0 0',paddingLeft:18,lineHeight:1.7}}>{permissions.map(x=><li key={x}>{x.replaceAll('_',' ')}</li>)}</ul></div>)}</aside>
    </section>
   </>}
  </div>
 </main>
}
