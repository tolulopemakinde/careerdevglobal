import test from 'node:test';
import assert from 'node:assert/strict';
import { createOperationHandler } from '../supabase/functions/careerdev-calendly-operations/handler.mjs';
import { encryptCalendlyValue } from '../supabase/functions/_shared/calendly-acceptance.mjs';
import { calendlyOperationMode, runAcceptanceBooking } from '../lib/calendly-acceptance-target.mjs';
const appOrigin='https://preview.example.test',hostUri='https://api.calendly.com/users/host';
const bookingId='00000000-0000-4000-8000-000000000051',actorId='coach-profile';
const typeUri='https://api.calendly.com/event_types/type',eventUri='https://api.calendly.com/scheduled_events/event',inviteeUri=eventUri+'/invitees/person';
async function fixture(options={}){
 const encryptionKey=crypto.randomUUID(),access=crypto.randomUUID(),cipher=await encryptCalendlyValue(access,encryptionKey);
 const calls=[],providerCalls=[];let operation=options.kind==='cancel'?null:null;let receipt;let kind=options.kind??'confirm';
 const db={auth:{async getUser(token){calls.push(['auth']);return {data:{user:token==='session'?{id:actorId}:null},error:null};}},
  async rpc(name,args){calls.push([name,args]);
   if(name==='begin_calendly_operation'){
    assert.equal(args.p_actor_id,actorId);if(options.unauthorized)throw new Error('unrelated actor');
    if(operation)return {data:{...operation,dispatch:false}};
    if(args.p_snapshot===null)return {data:null};
    operation={...args.p_snapshot,id:'claim',kind:args.p_kind,state:'external_pending'};return {data:{...operation,dispatch:true}};
   }
   if(name==='record_calendly_receipt'){receipt=[args.p_event_uri,args.p_invitee_uri];operation.provider_event_uri=receipt[0];operation.provider_invitee_uri=receipt[1];return {data:null};}
   if(name==='flag_calendly_operation'){operation.state='reconciliation_required';return {data:null};}
   assert.equal(name,'finish_calendly_operation');assert.equal(args.p_booking_id,bookingId);operation.state='succeeded';return {data:null};
  },from(table){const filters={};const q={select(){return q;},eq(k,v){filters[k]=v;return q;},async maybeSingle(){calls.push([table,filters]);
    if(table==='profiles')return {data:filters.id===actorId?{role:'coach',status:options.inactive?'inactive':'active'}:{email:options.unapprovedParticipant?'other@example.test':'client@example.test',full_name:'Synthetic Client',timezone:'UTC',status:'active'}};
    if(table==='clients')return {data:{profile_id:'client-profile'}};
    if(table==='marketplace_booking_requests')return {data:{client_id:'client',coach_id:'coach',coach_service_offering_id:'offering',requested_start:'2090-01-01T10:00:00Z',requested_end:'2090-01-01T10:30:00Z',calendly_event_uri:kind==='cancel'?eventUri:null,calendly_invitee_uri:kind==='cancel'?inviteeUri:null}};
    if(table==='coach_service_offerings')return {data:{calendly_event_type_uri:typeUri}};
    assert.equal(table,'calendly_connections');return {data:{calendly_user_uri:options.wrongHost?'https://api.calendly.com/users/other':hostUri,access_token_ciphertext:cipher,token_expires_at:options.expired?'2000-01-01T00:00:00Z':'2090-01-01T00:00:00Z'}};
   }};return q;}};
 const handler=createOperationHandler({config:{appOrigin,hostUri},db,encryptionKey,participantEmails:['client@example.test'],async send(url,request){
  assert.ok(request.headers.Authorization==='Bearer '+access);providerCalls.push([url,request.method]);
  const event={uri:eventUri,event_type:typeUri,status:kind==='cancel'&&providerCalls.some(([u])=>u.endsWith('/cancellation'))?'canceled':'active',start_time:'2090-01-01T10:00:00Z',end_time:'2090-01-01T10:30:00Z',event_memberships:[{user:hostUri}]};
  if(url.endsWith('/invitees')&&request.method==='POST'){
   assert.ok(operation,'Provider create must follow durable claim');assert.equal(operation.state,'external_pending');
   if(options.timeout)throw new Error('uncertain transport');
   const payload=JSON.parse(request.body);assert.equal(payload.tracking.utm_content,'claim');return Response.json({resource:{event:eventUri,uri:inviteeUri}});
  }
  if(url.endsWith('/cancellation')){assert.equal(request.method,'POST');assert.ok(operation);return new Response(null,{status:204});}
  if(url===typeUri)return Response.json({resource:{uri:typeUri,active:true,kind:'solo',profile:{type:'User',owner:hostUri},duration:30,is_paid:false,booking_method:'instant',locations:[{kind:'zoom'}],custom_questions:[]}});
  if(url.includes('/event_type_available_times?'))return Response.json({collection:[{status:'available',start_time:'2090-01-01T10:00:00Z'}]});
  if(url===eventUri)return Response.json({resource:event});
  assert.equal(url,inviteeUri);return Response.json({resource:{uri:inviteeUri,event:eventUri,status:event.status,tracking:{utm_source:'careerdev-marketplace',utm_content:'claim'}}});
 }});
 const invoke=(extra={},origin=appOrigin,token='session')=>handler(new Request('https://isolated.example.test/functions/v1/careerdev-calendly-operations',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+token},body:JSON.stringify({booking_id:bookingId,kind,...extra})}));
 return {invoke,calls,providerCalls,operation:()=>operation,receipt:()=>receipt};
}
test('durable HTTP confirmation claims before POST, records receipt and finishes original booking',async()=>{
 const f=await fixture();const r=await f.invoke({actor_id:'forged'});assert.equal(r.status,200);assert.equal((await r.json()).state,'succeeded');assert.deepEqual(f.receipt(),[eventUri,inviteeUri]);
 assert.equal(f.providerCalls.filter(([u,m])=>u.endsWith('/invitees')&&m==='POST').length,1);
 assert.equal((await f.invoke()).status,200);assert.equal(f.providerCalls.filter(([u,m])=>u.endsWith('/invitees')&&m==='POST').length,1);
});
test('durable HTTP cancellation verifies target before its single POST',async()=>{
 const f=await fixture({kind:'cancel'});assert.equal((await f.invoke()).status,200);const calls=f.providerCalls;
 assert.ok(calls.findIndex(([u])=>u===eventUri)<calls.findIndex(([u])=>u.endsWith('/cancellation')));
 assert.equal(calls.filter(([u])=>u.endsWith('/cancellation')).length,1);
});
test('uncertain provider result is retained and never dispatched again',async()=>{
 const f=await fixture({timeout:true});assert.equal((await f.invoke()).status,409);assert.equal(f.operation().state,'reconciliation_required');assert.equal((await f.invoke()).status,409);
 assert.equal(f.providerCalls.filter(([u,m])=>u.endsWith('/invitees')&&m==='POST').length,1);
});
test('unrelated actor is denied before private rows and provider access',async()=>{
 const f=await fixture({unauthorized:true});assert.equal((await f.invoke()).status,409);assert.equal(f.providerCalls.length,0);assert.ok(!f.calls.some(([t])=>t==='calendly_connections'||t==='marketplace_booking_requests'));
});
test('wrong designated host, expired token, inactive actor and unapproved participant cannot reach provider',async()=>{
 for(const options of [{wrongHost:true},{expired:true},{inactive:true},{unapprovedParticipant:true}]){const f=await fixture(options);assert.ok([404,409].includes((await f.invoke()).status));assert.equal(f.providerCalls.length,0);}
});
test('wrong origin, invalid session and malformed booking are denied',async()=>{
 const f=await fixture();assert.equal((await f.invoke({},'https://untrusted.example.test')).status,404);assert.equal((await f.invoke({},appOrigin,'invalid')).status,401);assert.equal((await f.invoke({booking_id:'bad'})).status,400);assert.equal(f.providerCalls.length,0);
});
test('frontend target flag rejects both protected projects and mismatched backend',()=>{
 assert.equal(calendlyOperationMode(undefined,'anything'),'legacy');assert.equal(calendlyOperationMode('abcdefghijklmnopqrst','https://abcdefghijklmnopqrst.supabase.co'),'acceptance');
 for(const ref of ['ufmhrmzumqkjvaezrmxf','yyevuwvtrktrzwuzeddo','invalid'])assert.equal(calendlyOperationMode(ref,`https://${ref}.supabase.co`),'blocked');
 assert.equal(calendlyOperationMode('abcdefghijklmnopqrst','https://other.example.test'),'blocked');
});
test('frontend operation response never falls back or claims unknown outcome succeeded',async()=>{
 let count=0;const client={functions:{async invoke(name,{body}){count++;assert.equal(name,'careerdev-calendly-operations');assert.equal(body.booking_id,bookingId);return {data:{state:'reconciliation_required'}};}}};
 assert.equal((await runAcceptanceBooking(client,bookingId,'confirm')).status,'review');assert.equal(count,1);
});
