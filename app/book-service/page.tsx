import './styles.css';
import {readPublicDirectory, type DirectoryResult} from '../../lib/public-directory';
import {safeCalendlyUrl} from '../../lib/scheduling';

type Service={offering_id:string;service_id:string;coach_id:string;coach_name:string;coach_avatar_url:string|null;service_name:string;category:string;title:string;description:string|null;price:number|null;currency:string|null;duration_minutes:number;delivery_mode:string;calendly_booking_url?:string|null};

async function getServices():Promise<DirectoryResult<Service>>{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL||'https://ufmhrmzumqkjvaezrmxf.supabase.co';
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||'sb_publishable_8lIUCYbLzqp69RpZmE8ktA_56-doCVl';
 const directory=await readPublicDirectory<Service>(url,key,'get_public_service_directory');
 if(directory.status==='unavailable'||directory.items.length===0)return directory;
 const links=await readPublicDirectory<{offering_id:string;calendly_booking_url:string}>(url,key,'get_public_calendly_booking_links');
 const byOffering=new Map(links.items.map(x=>[x.offering_id,x.calendly_booking_url]));
 return {status:'ready',items:directory.items.map(service=>({...service,calendly_booking_url:safeCalendlyUrl(byOffering.get(service.offering_id))}))};
}

export default async function BookServicePage({searchParams}:{searchParams:Promise<{category?:string}>}){
 const directory=await getServices();
 const items=directory.items;
 const params=await searchParams;
 const categories=['All',...Array.from(new Set(items.map(x=>x.category).filter(Boolean)))];
 const category=params?.category&&categories.includes(params.category)?params.category:'All';
 const filtered=category==='All'?items:items.filter(x=>x.category===category);
 return <main className="service-directory"><header className="service-header"><a href="/">CareerDev Global</a><nav><a href="/book-coaching">Book a Coaching Session</a><a href="/book-service" aria-current="page">Book a Service</a><a href="/account">My Account</a></nav></header><section className="service-hero"><p className="eyebrow">CAREERDEV GLOBAL SERVICES</p><h1>Book a Service</h1><p>Choose a service directly from an available coach. Clients can browse and select any bookable service without going through coach matching.</p><div className="service-actions"><a href="/book-coaching">Browse coaches →</a><a href="/coach-matching">Find a coach by goal →</a></div></section><section className="service-shell"><div className="service-heading"><div><p className="eyebrow">BOOKABLE SERVICES</p><h2>Choose what you need</h2></div><div className="category-tabs">{categories.map(c=><a key={c} className={category===c?'active':''} href={c==='All'?'/book-service':`/book-service?category=${encodeURIComponent(c)}`}>{c}</a>)}</div></div>{directory.status==='unavailable'?<div className="service-empty" role="status"><h3>Service availability is temporarily unavailable.</h3><p>Please refresh this page or contact CareerDev Global for help.</p></div>:filtered.length===0?<div className="service-empty"><h3>No services are currently bookable.</h3><p>Please check back soon.</p></div>:<div className="service-grid">{filtered.map(s=><article className="service-card" key={s.offering_id}><div className="service-coach"><span className="service-avatar">{s.coach_avatar_url?<img src={s.coach_avatar_url} alt=""/>:s.coach_name.split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase()}</span><div><strong>{s.coach_name}</strong><span>Verified coach</span></div></div><p className="eyebrow">{s.category}</p><h3>{s.title}</h3>{s.service_name!==s.title&&<p className="service-name">{s.service_name}</p>}<p>{s.description||'A professional CareerDev Global service delivered by this coach.'}</p><div className="service-meta"><span>{s.duration_minutes} min</span><span>{s.delivery_mode}</span>{s.price!=null&&<strong>{s.currency} {s.price}</strong>}</div><a className="service-button" href={`/coach-profile/${s.coach_id}?offering=${encodeURIComponent(s.offering_id)}&mode=service`}>Request this service →</a>{s.calendly_booking_url&&<><a className="service-details-link" href={s.calendly_booking_url} target="_blank" rel="noopener noreferrer">Direct Calendly fallback →</a><p className="service-booking-note">The fallback completes scheduling on Calendly and will not be recorded or paid through CareerDev’s marketplace. Choose one route to avoid duplicate requests.</p></>}</article>)}</div>}</section></main>;
}
