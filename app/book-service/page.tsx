import './styles.css';

type Service={offering_id:string;service_id:string;coach_id:string;coach_name:string;coach_avatar_url:string|null;service_name:string;category:string;title:string;description:string|null;price:number|null;currency:string|null;duration_minutes:number;delivery_mode:string;calendly_booking_url?:string|null};

async function getServices():Promise<Service[]>{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL||'https://ufmhrmzumqkjvaezrmxf.supabase.co';
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||'sb_publishable_8lIUCYbLzqp69RpZmE8ktA_56-doCVl';
 try{
  const response=await fetch(`${url}/rest/v1/rpc/get_public_service_directory`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:'{}',cache:'no-store'});
  if(!response.ok)return [];
  const data=await response.json();
  if(!Array.isArray(data))return [];
  const linksResponse=await fetch(`${url}/rest/v1/rpc/get_public_calendly_booking_links`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:'{}',cache:'no-store'});
  const links=linksResponse.ok?await linksResponse.json():[];
  const byOffering=new Map(Array.isArray(links)?links.map((x:any)=>[x.offering_id,x.calendly_booking_url]):[]);
  return data.map((service:Service)=>({...service,calendly_booking_url:byOffering.get(service.offering_id)||null})) as Service[];
 }catch{return []}
}

export default async function BookServicePage({searchParams}:{searchParams:Promise<{category?:string}>}){
 const items=await getServices();
 const params=await searchParams;
 const categories=['All',...Array.from(new Set(items.map(x=>x.category).filter(Boolean)))];
 const category=params?.category&&categories.includes(params.category)?params.category:'All';
 const filtered=category==='All'?items:items.filter(x=>x.category===category);
 return <main className="service-directory"><header className="service-header"><a href="/">CareerDev Global</a><nav><a href="/book-coaching">Book a Coaching Session</a><a href="/book-service" aria-current="page">Book a Service</a><a href="/account">My Account</a></nav></header><section className="service-hero"><p className="eyebrow">CAREERDEV GLOBAL SERVICES</p><h1>Book a Service</h1><p>Choose a service directly from an available coach. Clients can browse and select any bookable service without going through coach matching.</p><div className="service-actions"><a href="/book-coaching">Browse coaches →</a><a href="/coach-matching">Find a coach by goal →</a></div></section><section className="service-shell"><div className="service-heading"><div><p className="eyebrow">BOOKABLE SERVICES</p><h2>Choose what you need</h2></div><div className="category-tabs">{categories.map(c=><a key={c} className={category===c?'active':''} href={c==='All'?'/book-service':`/book-service?category=${encodeURIComponent(c)}`}>{c}</a>)}</div></div>{filtered.length===0?<div className="service-empty"><h3>No services are currently bookable.</h3><p>Please check back soon.</p></div>:<div className="service-grid">{filtered.map(s=><article className="service-card" key={s.offering_id}><div className="service-coach"><span className="service-avatar">{s.coach_avatar_url?<img src={s.coach_avatar_url} alt=""/>:s.coach_name.split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase()}</span><div><strong>{s.coach_name}</strong><span>Verified coach</span></div></div><p className="eyebrow">{s.category}</p><h3>{s.title}</h3>{s.service_name!==s.title&&<p className="service-name">{s.service_name}</p>}<p>{s.description||'A professional CareerDev Global service delivered by this coach.'}</p><div className="service-meta"><span>{s.duration_minutes} min</span><span>{s.delivery_mode}</span>{s.price!=null&&<strong>{s.currency} {s.price}</strong>}</div>{s.calendly_booking_url?<><a className="service-button" href={s.calendly_booking_url} target="_blank" rel="noopener noreferrer">Book on Calendly →</a><p className="service-booking-note">Scheduling is completed on Calendly. This booking will not be recorded or paid through CareerDev’s marketplace flow.</p><a className="service-details-link" href={`/coach-profile/${s.coach_id}?offering=${encodeURIComponent(s.offering_id)}`}>View coach and service details</a></>:<a className="service-button" href={`/coach-profile/${s.coach_id}?offering=${encodeURIComponent(s.offering_id)}`}>Book this service →</a>}</article>)}</div>}</section></main>;
}
