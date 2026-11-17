import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createOAuthHandler } from '../supabase/functions/careerdev-calendly-oauth/handler.mjs';
import { createOperationHandler } from '../supabase/functions/careerdev-calendly-operations/handler.mjs';
export async function runAcceptanceAdapterChecks({ admin, owner, signIn, check }) {
  const coach = await signIn('acceptance-coach');
  const coachId='00000000-0000-0000-0000-000000000011',bookingId='00000000-0000-0000-0000-000000000052';
  const appOrigin='http://localhost:3000',hostUri='https://api.calendly.com/users/coach',typeUri='https://api.calendly.com/event_types/type-1';
  const eventUri='https://api.calendly.com/scheduled_events/adapter',inviteeUri=eventUri+'/invitees/synthetic';
  await check(admin.from('profiles').insert({id:coach.id,role:'coach',status:'active'}),'Create synthetic coach profile');
  await check(admin.from('coaches').update({profile_id:coach.id}).eq('id',coachId),'Link real local Auth coach');
  await check(admin.from('profiles').update({email:'client-owner@example.test',full_name:'Synthetic Client',timezone:'UTC'}).eq('id',owner.id),'Add synthetic invitee metadata');
  await check(admin.from('marketplace_booking_requests').update({requested_start:'2090-01-03T10:00:00Z',requested_end:'2090-01-03T10:30:00Z'}).eq('id',bookingId),'Set isolated future slot');
  const config={appOrigin,hostUri,appName:'Synthetic local app',redirectUri:'http://127.0.0.1:54321/functions/v1/careerdev-calendly-oauth',clientId:randomUUID(),clientSecret:randomUUID(),encryptionKey:randomUUID(),scopes:['users:read','event_types:read','scheduled_events:write']};
  let exchanges=0;
  const access=randomUUID();
  const oauth=createOAuthHandler({config,db:admin,async send(url){
    if(url==='https://auth.calendly.com/oauth/token'){exchanges++;return Response.json({access_token:access,refresh_token:randomUUID(),expires_in:3600,scope:config.scopes.join(' ')});}
    assert.equal(url,'https://api.calendly.com/users/me');return Response.json({resource:{uri:hostUri,name:'Synthetic host',email:'host@example.test'}});
  }});
  const authorization=await oauth(new Request(config.redirectUri,{method:'POST',headers:{Origin:appOrigin,Authorization:'Bearer '+coach.token},body:JSON.stringify({action:'authorize'})}));
  assert.equal(authorization.status,200);
  const url=new URL((await authorization.json()).authorization_url),state=url.searchParams.get('state');
  const callback=()=>oauth(new Request(config.redirectUri+'?code=synthetic-code&state='+state));
  const callbacks=await Promise.all([callback(),callback()]);
  assert.equal(exchanges,1);assert.equal(callbacks.filter(r=>r.headers.get('Location').endsWith('=connected')).length,1);
  const remaining=await check(admin.from('calendly_oauth_states').select('id'),'Read synthetic consumed state');assert.equal(remaining.length,0);
  let posts=0,cancellations=0,canceled=false,tracking;
  const handler=createOperationHandler({config,db:admin,encryptionKey:config.encryptionKey,participantEmails:['client-owner@example.test'],async send(url,request){
    assert.ok(request.headers.Authorization==='Bearer '+access);
    if(url==='https://api.calendly.com/invitees'){
      posts++;tracking=JSON.parse(request.body).tracking;return Response.json({resource:{event:eventUri,uri:inviteeUri}});
    }
    if(url.endsWith('/cancellation')){cancellations++;canceled=true;return new Response(null,{status:204});}
    if(url===typeUri)return Response.json({resource:{uri:typeUri,active:true,kind:'solo',profile:{type:'User',owner:hostUri},duration:30,is_paid:false,booking_method:'instant',locations:[{kind:'zoom'}],custom_questions:[]}});
    if(url.includes('/event_type_available_times?'))return Response.json({collection:[{status:'available',start_time:'2090-01-03T10:00:00Z'}]});
    const status=canceled?'canceled':'active';
    if(url===eventUri)return Response.json({resource:{uri:eventUri,event_type:typeUri,status,start_time:'2090-01-03T10:00:00Z',end_time:'2090-01-03T10:30:00Z',event_memberships:[{user:hostUri}]}});
    assert.equal(url,inviteeUri);return Response.json({resource:{uri:inviteeUri,event:eventUri,status,tracking}});
  }});
  const invoke=kind=>handler(new Request('http://127.0.0.1:54321/functions/v1/careerdev-calendly-operations',{method:'POST',headers:{Origin:appOrigin,Authorization:'Bearer '+coach.token},body:JSON.stringify({booking_id:bookingId,kind,actor_id:'ignored-forgery'})}));
  const confirmations=await Promise.all([invoke('confirm'),invoke('confirm')]);
  assert.ok(confirmations.some(r=>r.status===200));assert.equal(posts,1);
  const confirmed=await check(admin.from('marketplace_booking_requests').select('id,booking_status,calendly_event_uri').eq('id',bookingId).single(),'Read durable confirmation');
  assert.equal(confirmed.booking_status,'confirmed');assert.equal(confirmed.calendly_event_uri,eventUri);
  const transaction=await check(owner.client.rpc('create_marketplace_transaction',{p_booking_id:bookingId}),'Initialize synthetic transaction');
  assert.equal((await invoke('cancel')).status,200);assert.equal(cancellations,1);
  const after=await check(admin.from('marketplace_booking_requests').select('id,booking_status,calendly_event_uri').eq('id',bookingId).single(),'Read durable cancellation');
  assert.equal(after.id,bookingId);assert.equal(after.booking_status,'cancelled');assert.equal(after.calendly_event_uri,eventUri);
  const retained=await check(admin.from('marketplace_transactions').select('id').eq('booking_id',bookingId).single(),'Read retained synthetic transaction');assert.equal(retained.id,transaction);
  console.log('Acceptance adapter checks passed: real local Auth; atomic OAuth claim; one provider confirmation/cancellation; booking and synthetic transaction preserved. Provider responses were synthetic.');
}
