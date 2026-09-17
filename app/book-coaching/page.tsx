import './styles.css';

type Coach={coach_id:string;display_name:string;headline:string|null;bio:string|null;avatar_url:string|null;country:string|null;timezone:string|null;years_coaching:number|null;specializations:string[]|null;coaching_formats:string[]|null;offering_count:number};

async function getCoaches():Promise<Coach[]>{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL||'https://ufmhrmzumqkjvaezrmxf.supabase.co';
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||'sb_publishable_8lIUCYbLzqp69RpZmE8ktA_56-doCVl';
 try{
  const response=await fetch(`${url}/rest/v1/rpc/get_public_coach_directory`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:'{}',cache:'no-store'});
  if(!response.ok)return [];
  const data=await response.json();
  return Array.isArray(data)?data as Coach[]:[];
 }catch{return []}
}

export default async function BookCoachingPage(){
 const coaches=await getCoaches();
 return <main className="booking-directory"><header className="booking-header"><a href="/">CareerDev Global</a><nav><a href="/book-coaching" aria-current="page">Book a Coaching Session</a><a href="/book-service">Book a Service</a><a href="/account">My Account</a></nav></header><section className="booking-hero"><p className="eyebrow">COACHING MARKETPLACE</p><h1>Book a Coaching Session</h1><p>Choose any available CareerDev Global coach. You do not need to use the matching tool—browse the marketplace and make your own choice.</p><div className="booking-actions"><a href="/book-service">Browse services →</a><a href="/coach-matching">Use coach matching →</a></div></section><section className="directory-shell"><div className="directory-heading"><div><p className="eyebrow">AVAILABLE COACHES</p><h2>Choose your coach</h2></div><span>{coaches.length} available</span></div>{coaches.length===0?<div className="directory-empty"><h3>No coaches are currently bookable.</h3><p>Please check back soon.</p></div>:<div className="coach-directory-grid">{coaches.map(c=>{const initials=c.display_name.split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase();return <article className="coach-directory-card" key={c.coach_id}><div className="coach-avatar">{c.avatar_url?<img src={c.avatar_url} alt=""/>:initials}</div><p className="eyebrow">VERIFIED COACH</p><h3>{c.display_name}</h3><p className="coach-headline">{c.headline||'Career coach'}</p><p>{c.bio||'Professional coaching support tailored to your goals.'}</p><div className="chips">{(c.specializations||[]).slice(0,4).map(x=><span key={x}>{x}</span>)}</div><div className="coach-meta"><span>{c.country||'Global'}{c.timezone?` · ${c.timezone}`:''}</span><span>{c.offering_count} bookable {c.offering_count===1?'service':'services'}</span></div><a className="primary-button" href={`/coach-profile/${c.coach_id}`}>View profile &amp; book session →</a></article>})}</div>}</section></main>;
}
