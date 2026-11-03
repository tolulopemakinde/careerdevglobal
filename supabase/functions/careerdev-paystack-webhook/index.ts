import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'jsr:@supabase/supabase-js@2.117.3';
import {applyRecordedEvent,exactSubscription,transactionReference} from '../_shared/ai-billing-reconcile.ts';
const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const aiTypes=['subscription.create','subscription.disable','subscription.not_renew','invoice.create','invoice.payment_failed','invoice.update'];
const marketplaceTypes=['charge.success','charge.failed','refund.processed'];
function hex(bytes:ArrayBuffer){return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('')}
function same(a:string,b:string){if(a.length!==b.length)return false;let difference=0;for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);return difference===0}
Deno.serve(async req=>{
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 const url=Deno.env.get('SUPABASE_URL')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??(()=>{try{return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default}catch{return undefined}})(),secret=Deno.env.get('PAYSTACK_SECRET_KEY');
 if(!service||!secret)return reply({error:'Webhook unavailable'},503);
 try{
  const raw=new Uint8Array(await req.arrayBuffer()),signature=(req.headers.get('x-paystack-signature')??'').trim().toLowerCase();
  if(!/^[a-f0-9]{128}$/.test(signature))return reply({error:'Invalid Paystack signature'},401);
  const signingKey=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-512'},false,['sign']);
  if(!same(hex(await crypto.subtle.sign('HMAC',signingKey,raw)),signature))return reply({error:'Invalid Paystack signature'},401);
  let event:any;try{event=JSON.parse(new TextDecoder().decode(raw))}catch{return reply({error:'Invalid JSON'},400)}
  const type=event?.event,data=event?.data;
  if(typeof type!=='string'||!data||(!aiTypes.includes(type)&&!marketplaceTypes.includes(type)))return reply({error:'Unsupported event'},400);
  const hash=hex(await crypto.subtle.digest('SHA-256',raw)),reference=transactionReference(data),code=String(data.subscription_code??data.subscription?.subscription_code??'');
  const sb=createClient(url,service);
  const sub=await exactSubscription(sb,reference,code);
  let marketplaceId:string|null=null;
  if(reference){
   const [transaction,intent]=await Promise.all([
    sb.from('marketplace_transactions').select('id').eq('provider_key','paystack').eq('provider_transaction_reference',reference).maybeSingle(),
    sb.from('marketplace_payment_intents').select('transaction_id').eq('provider_key','paystack').eq('provider_intent_reference',reference).maybeSingle()
   ]);
   if(transaction.error||intent.error)throw new Error('Marketplace correlation failed');
   if(transaction.data&&intent.data&&transaction.data.id!==intent.data.transaction_id)throw new Error('Conflicting marketplace identifiers');
   marketplaceId=transaction.data?.id??intent.data?.transaction_id??null;
  }
  if(sub&&marketplaceId)return reply({error:'Conflicting AI and marketplace identity; reconciliation required'},409);
  const isAi=aiTypes.includes(type)||!!sub||!!code||reference.startsWith('CDG-AI-');
  // Refunds are quarantined for verified operator reconciliation; never route AI refunds into marketplace.
  const aiRefund=isAi&&type==='refund.processed';
  const table=isAi?'ai_agent_subscription_webhook_events':'marketplace_payment_webhook_events';
  // A marketplace transaction/refund keeps its identity even if JSON whitespace or key order changes.
  // Conflicting content under that identity is quarantined by the stored hash check.
  const providerId=['string','number'].includes(typeof data.id)?String(data.id):'';
  const eventIdentity=type+':'+(isAi?hash:(providerId||reference||hash));
  if(!isAi){
   // Recognize historical marketplace events without changing their ledger behavior.
   const legacy=String(data.id??data.reference??'');
   if(legacy){
    const old=await sb.from(table).select('id,processing_status,event_type').eq('provider_key','paystack').eq('provider_event_reference',legacy).maybeSingle();
    if(old.error)throw new Error('Legacy marketplace lookup failed');
    if(old.data?.event_type===type&&old.data.processing_status==='processed')return reply({received:true,processed:true,duplicate:true});
   }
  }
  const insert=await sb.from(table).insert({provider_key:'paystack',provider_event_reference:eventIdentity,event_type:type,signature_verified:true,processing_status:'verified',payload_hash:hash,payload:event,
   ...(isAi?{subscription_id:sub?.id??null,transaction_reference:reference||null}:{transaction_id:marketplaceId})}).select('*').single();
  let stored=insert.data;
  if(insert.error){
   const existing=await sb.from(table).select('*').eq('provider_key','paystack').eq('provider_event_reference',eventIdentity).maybeSingle();
   if(existing.error||!existing.data)throw new Error('Event could not be recorded');
   if(existing.data.payload_hash!==hash)return reply({error:'Conflicting event content; reconciliation required'},409);
   stored=existing.data;
  }
  if(stored.processing_status==='processed')return reply({received:true,processed:true,duplicate:true});
  if(aiRefund){
   await sb.from(table).update({processing_status:'failed',error_message:'AI refund requires verified payment reversal reconciliation'}).eq('id',stored.id).neq('processing_status','processed');
   return reply({received:true,processed:false,reconciliation_required:true},409);
  }
  try{
   const applied=isAi?await applyRecordedEvent(sb,secret,stored):(await sb.rpc('apply_paystack_webhook_state',{p_webhook_event_id:stored.id}));
   const result=isAi?applied:applied.data;
   if(!isAi&&applied.error)throw new Error('Marketplace reconciliation failed');
   return reply({received:true,processed:result?.processed===true,duplicate:result?.duplicate===true,reconciliation_required:result?.processed!==true},result?.processed?200:409);
  }catch{
   await sb.from(table).update({processing_status:'failed',error_message:'Provider or transactional verification pending'}).eq('id',stored.id).neq('processing_status','processed');
   return reply({received:true,processed:false,reconciliation_required:true},503);
  }
 }catch{return reply({error:'Webhook reconciliation failed'},503)}
});
