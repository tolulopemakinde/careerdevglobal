import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createWebhookHandler, createWebhookWorker } from '../supabase/functions/careerdev-calendly-webhook/handler.mjs';
import { createCalendlyLifecycle } from '../supabase/functions/_shared/calendly-lifecycle.mjs';
import { calendlyScopes } from '../supabase/functions/_shared/calendly-acceptance.mjs';
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
  const config={appOrigin,hostUri,appName:'Synthetic local app',redirectUri:'http://127.0.0.1:54321/functions/v1/careerdev-calendly-oauth',clientId:randomUUID(),clientSecret:randomUUID(),encryptionKey:randomUUID(),scopes:calendlyScopes,participantEmails:['client-owner@example.test'],webhookSigningKey:randomUUID()};
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
  const send=async(url,request)=>{
    assert.ok(request.headers.Authorization==='Bearer '+access);
    if(url==='https://api.calendly.com/invitees'){
      posts++;tracking=JSON.parse(request.body).tracking;throw new Error('Synthetic lost provider response after create');
    }
    if(url.endsWith('/cancellation')){cancellations++;canceled=true;return new Response(null,{status:204});}
    if(url===typeUri)return Response.json({resource:{uri:typeUri,active:true,kind:'solo',profile:{type:'User',owner:hostUri},duration:30,is_paid:false,booking_method:'instant',locations:[{kind:'zoom'}],custom_questions:[]}});
    if(url.includes('/event_type_available_times?'))return Response.json({collection:[{status:'available',start_time:'2090-01-03T10:00:00Z'}]});
    const status=canceled?'canceled':'active';
    if(url===eventUri)return Response.json({resource:{uri:eventUri,event_type:typeUri,status,start_time:'2090-01-03T10:00:00Z',end_time:'2090-01-03T10:30:00Z',event_memberships:[{user:hostUri}]}});
    assert.equal(url,inviteeUri);return Response.json({resource:{uri:inviteeUri,event:eventUri,status,tracking}});
  };
  const handler=createOperationHandler({config,db:admin,encryptionKey:config.encryptionKey,participantEmails:config.participantEmails,send});
  const invoke=kind=>handler(new Request('http://127.0.0.1:54321/functions/v1/careerdev-calendly-operations',{method:'POST',headers:{Origin:appOrigin,Authorization:'Bearer '+coach.token},body:JSON.stringify({booking_id:bookingId,kind,actor_id:'ignored-forgery'})}));
  const confirmations=await Promise.all([invoke('confirm'),invoke('confirm')]);
  assert.ok(confirmations.every(r=>r.status===409));assert.equal(posts,1);
  const pending=await check(admin.from('marketplace_booking_requests').select('booking_status').eq('id',bookingId).single(),'Read uncertain booking');assert.equal(pending.booking_status,'requested');
  const worker=createWebhookWorker({config,db:admin,send});
  const webhook=createWebhookHandler({config,db:admin,worker});
  const raw=JSON.stringify({event:'invitee.created',payload:{event:eventUri,uri:inviteeUri,tracking}});
  const stamp=String(Math.floor(Date.now()/1000));
  const signing=await crypto.subtle.importKey('raw',new TextEncoder().encode(config.webhookSigningKey),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',signing,new TextEncoder().encode(stamp+'.'+raw)));
  const signature='t='+stamp+',v1='+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  const deliver=()=>webhook(new Request('http://127.0.0.1:54321/functions/v1/careerdev-calendly-webhook',{method:'POST',body:raw,headers:{'Calendly-Webhook-Signature':signature}}));
  assert.equal((await deliver()).status,202);assert.equal((await deliver()).status,202);assert.equal(posts,1);
  const receipts=await check(admin.from('calendly_acceptance_webhooks').select('state'),'Read deduplicated receipt');assert.equal(receipts.length,1);assert.equal(receipts[0].state,'done');
  const confirmed=await check(admin.from('marketplace_booking_requests').select('id,booking_status,calendly_event_uri').eq('id',bookingId).single(),'Read durable confirmation');
  assert.equal(confirmed.booking_status,'confirmed');assert.equal(confirmed.calendly_event_uri,eventUri);
  const transaction=await check(owner.client.rpc('create_marketplace_transaction',{p_booking_id:bookingId}),'Initialize synthetic transaction');
  assert.equal((await invoke('cancel')).status,200);assert.equal(cancellations,1);
  const after=await check(admin.from('marketplace_booking_requests').select('id,booking_status,calendly_event_uri').eq('id',bookingId).single(),'Read durable cancellation');
  assert.equal(after.id,bookingId);assert.equal(after.booking_status,'cancelled');assert.equal(after.calendly_event_uri,eventUri);
  const retained=await check(admin.from('marketplace_transactions').select('id').eq('booking_id',bookingId).single(),'Read retained synthetic transaction');assert.equal(retained.id,transaction);
  // Exercise rotating credentials and provider cleanup through real local
  // PostgREST grants/constraints, with entirely synthetic provider responses.
  const lifecycleConfig={...config,backendUrl:'http://127.0.0.1:54321',organizationUri:'https://api.calendly.com/organizations/synthetic',webhookUri:'http://127.0.0.1:54321/functions/v1/careerdev-calendly-webhook'};
  let refreshes=0,revokes=0,sub=null,subscriptionCreates=0;
  const lifecycle=createCalendlyLifecycle({config:lifecycleConfig,db:admin,async send(url,request){
    if(url.endsWith('/oauth/token')){refreshes++;assert.ok(request.body.get('grant_type')==='refresh_token');return Response.json({access_token:randomUUID(),refresh_token:randomUUID(),expires_in:3600,scope:calendlyScopes.join(' ')});}
    if(url.endsWith('/users/me'))return Response.json({resource:{uri:hostUri}});
    if(url.endsWith('/oauth/revoke')){revokes++;return Response.json({});}
    if(url.includes('/webhook_subscriptions?'))return Response.json({collection:sub?[sub]:[]});
    if(request.method==='POST'&&url.endsWith('/webhook_subscriptions')){subscriptionCreates++;const body=JSON.parse(request.body);sub={uri:'https://api.calendly.com/webhook_subscriptions/synthetic',callback_url:body.url,organization:body.organization,user:body.user,scope:body.scope,events:body.events,state:'active'};return Response.json({resource:sub});}
    if(request.method==='DELETE'){sub=null;return new Response(null,{status:204});}
    throw new Error('Unexpected synthetic lifecycle request');
  }});
  await check(admin.from('calendly_connections').update({token_expires_at:'2000-01-01T00:00:00Z'}).eq('coach_id',coachId),'Expire synthetic connection');
  const refreshed=await Promise.allSettled([lifecycle.accessToken(coachId),lifecycle.accessToken(coachId)]);
  assert.ok(refreshed.some(r=>r.status==='fulfilled'));assert.equal(refreshes,1);
  assert.equal((await lifecycle.subscription(coachId,'ensure')).state,'active');
  assert.equal((await lifecycle.subscription(coachId,'ensure')).state,'active');assert.equal(subscriptionCreates,1);
  await lifecycle.disconnect(coachId);assert.equal(revokes,2);
  const disconnected=await check(admin.from('calendly_connections').select('coach_id').eq('coach_id',coachId),'Verify revoked credential deletion');assert.equal(disconnected.length,0);
  console.log('Acceptance adapter checks passed: real local Auth; atomic OAuth claim; lost confirmation response recovered by signed webhook; duplicate receipt applied once; one provider confirmation/cancellation; booking and synthetic transaction preserved. Serialized refresh, subscription replay and credential revocation/deletion passed. Provider responses were synthetic.');
}
