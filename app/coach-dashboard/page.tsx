'use client';

import { useEffect, useState } from 'react';
import "./styles.css";
import { createSupabaseBrowserClient } from '../../lib/supabase-browser';

const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

export default function CoachDashboard() {
  const supabase = createSupabaseBrowserClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [coach, setCoach] = useState<any>(null);
  const [availability, setAvailability] = useState<any[]>([]);
  const [day, setDay] = useState(1);
  const [start, setStart] = useState('17:00');
  const [end, setEnd] = useState('21:00');
  const [timezone, setTimezone] = useState('Africa/Lagos');
  const [message, setMessage] = useState('');

  async function load(uid: string) {
    const { data: c } = await supabase.from('coaches').select('id,application_status,approved_at').eq('profile_id', uid).maybeSingle();
    setCoach(c);
    if (c) {
      const { data } = await supabase.from('coach_marketplace_availability').select('*').eq('coach_id', c.id).order('day_of_week').order('start_time');
      setAvailability(data ?? []);
    }
  }

  useEffect(() => { supabase.auth.getUser().then(({ data }) => { const uid = data.user?.id ?? null; setUserId(uid); if (uid) load(uid); }); }, []);

  async function addAvailability() {
    if (!coach) return;
    setMessage('');
    const { error } = await supabase.from('coach_marketplace_availability').insert({ coach_id: coach.id, day_of_week: day, start_time: start, end_time: end, timezone, active: true });
    if (error) setMessage(error.message); else { setMessage('Availability added.'); await load(userId!); }
  }

  async function toggle(id: string, active: boolean) {
    const { error } = await supabase.from('coach_marketplace_availability').update({ active: !active }).eq('id', id);
    if (error) setMessage(error.message); else await load(userId!);
  }

  async function activate() {
    if (!coach) return;
    const { data, error } = await supabase.rpc('admin_activate_coach', { p_coach_id: coach.id });
    if (error) setMessage(error.message); else setMessage(JSON.stringify(data));
    await load(userId!);
  }

  if (!userId) return <main className="coach-dash"><div className="dash-card"><h1>Coach dashboard</h1><p>Please sign in to manage your coach profile and availability.</p></div></main>;
  if (!coach) return <main className="coach-dash"><div className="dash-card"><h1>Coach dashboard</h1><p>No approved coach profile is connected to this account yet. Submit an application first.</p><a href="/coach-registration">Apply to coach →</a></div></main>;

  return <main className="coach-dash"><div className="dash-wrap"><header><a href="/coach-matching">← Coach matching</a><span>CareerDev Global · Coach dashboard</span></header><section className="dash-hero"><p>COACH MARKETPLACE</p><h1>Manage your availability</h1><p>Your profile can enter semantic matching only after approval, eligibility and active availability are confirmed.</p></section>
    {message && <div className="dash-message">{message}</div>}
    <section className="status-grid"><div><small>Application</small><strong>{coach.application_status}</strong></div><div><small>Availability</small><strong>{availability.filter(x => x.active).length} active slot(s)</strong></div><div><small>Marketplace</small><strong>{availability.some(x => x.active) ? 'Ready for eligibility check' : 'Availability required'}</strong></div></section>
    <section className="dash-card"><h2>Add availability</h2><div className="form-grid"><label>Day<select value={day} onChange={e => setDay(Number(e.target.value))}>{days.map((d,i)=><option value={i} key={d}>{d}</option>)}</select></label><label>Start<input type="time" value={start} onChange={e=>setStart(e.target.value)} /></label><label>End<input type="time" value={end} onChange={e=>setEnd(e.target.value)} /></label><label>Timezone<input value={timezone} onChange={e=>setTimezone(e.target.value)} /></label></div><button onClick={addAvailability}>Add availability</button></section>
    <section className="dash-card"><h2>Current availability</h2>{availability.length===0?<p>No availability has been added yet.</p>:<div className="slots">{availability.map(a=><div className={!a.active?'slot inactive':'slot'} key={a.id}><span>{days[a.day_of_week]} · {String(a.start_time).slice(0,5)}–{String(a.end_time).slice(0,5)} · {a.timezone}</span><button onClick={()=>toggle(a.id,a.active)}>{a.active?'Deactivate':'Activate'}</button></div>)}</div>}<button className="activate" onClick={activate}>Check eligibility & activate marketplace profile</button><p className="note">Activation is controlled by the marketplace eligibility gate. It does not bypass verification or agreement requirements.</p></section>
  </div></main>;
}
