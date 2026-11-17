import test from 'node:test';
import assert from 'node:assert/strict';
import { createOAuthHandler } from '../supabase/functions/careerdev-calendly-oauth/handler.mjs';
import { oauthAcceptanceConfig, grantedScopesCover, decryptCalendlyValue, sha256 } from '../supabase/functions/_shared/calendly-acceptance.mjs';
const backendUrl='https://abcdefghijklmnopqrst.supabase.co',appOrigin='https://preview.example.test',hostUri='https://api.calendly.com/users/acceptance-host';
function input(){return {enabled:'true',projectRef:'abcdefghijklmnopqrst',backendUrl,appOrigin,hostUri,appName:'Acceptance application',redirectUri:backendUrl+'/functions/v1/careerdev-calendly-oauth',clientId:crypto.randomUUID(),clientSecret:crypto.randomUUID(),encryptionKey:crypto.randomUUID()};}
function fixture(options={}){
 const config=oauthAcceptanceConfig(input());const states=new Map();const calls=[];let connection;let exchanges=0;
 const db={auth:{async getUser(jwt){return {data:{user:jwt==='session'?{id:'actor',is_anonymous:options.anonymous??false}:null},error:null};}},from(table){
  const filters={};let op='select',greater={};const q={select(){return q;},eq(k,v){filters[k]=v;return q;},gt(k,v){greater[k]=v;return q;},delete(){op='delete';return q;},
   async insert(row){states.set(row.state_hash,row);return {error:options.stateWriteError?new Error('fixture'):null};},
   async upsert(row){connection=row;return {error:options.persistError?new Error('fixture'):null};},
   update(){op='update';return q;},
   async maybeSingle(){calls.push([table,op]);if(table==='profiles')return {data:{role:'coach',status:options.inactive?'inactive':'active'}};
    if(table==='coaches')return {data:{id:'coach',profile_id:'actor',application_status:options.pending?'under_review':'approved'}};
    if(table==='calendly_oauth_states'){
     assert.equal(op,'delete');const row=states.get(filters.state_hash);
     if(!row||Date.parse(row.expires_at)<=Date.parse(greater.expires_at))return {data:null};
     states.delete(filters.state_hash);return {data:row};
    }
    return {data:connection??null};
   },then(resolve){resolve({error:null});}};return q;}};
 const access=crypto.randomUUID(),refresh=crypto.randomUUID();
 const handler=createOAuthHandler({config,db,async send(url,request){
  assert.equal(request.redirect,'error');
  if(url==='https://auth.calendly.com/oauth/token'){
   exchanges++;const body=request.body;assert.equal(body.get('redirect_uri'),config.redirectUri);assert.ok(body.get('code_verifier'));assert.ok(request.headers.Authorization.startsWith('Basic '));
   return Response.json({access_token:access,refresh_token:refresh,expires_in:3600,scope:options.missingScope?'users:read':config.scopes.join(' ')});
  }
  if(url.startsWith('https://api.calendly.com/event_types?')){
   assert.equal(new URL(url).searchParams.get('user'),hostUri);
   return Response.json({collection:[{uri:'https://api.calendly.com/event_types/owned',name:'Synthetic type',active:true,profile:{type:'User',owner:hostUri}},{uri:'https://api.calendly.com/event_types/foreign',active:true,profile:{type:'User',owner:'https://api.calendly.com/users/foreign'}}]});
  }
  assert.equal(url,'https://api.calendly.com/users/me');return Response.json({resource:{uri:options.wrongHost?'https://api.calendly.com/users/wrong':hostUri,name:'Synthetic host',email:'host@example.test'}});
 }});
 const authorize=()=>handler(new Request(config.redirectUri,{method:'POST',headers:{Origin:appOrigin,Authorization:'Bearer session'},body:JSON.stringify({action:'authorize'})}));
 async function begin(){const r=await authorize();assert.equal(r.status,200);return new URL((await r.json()).authorization_url);}
 const callback=state=>handler(new Request(config.redirectUri+'?code=synthetic-code&state='+state));
 return {config,states,calls,authorize,begin,callback,handler,connection:()=>connection,exchanges:()=>exchanges,access,refresh};
}
test('OAuth config rejects absent enablement, protected backend, production app and callback mismatch',()=>{
 for(const override of [{enabled:undefined},{projectRef:'ufmhrmzumqkjvaezrmxf'},{projectRef:'yyevuwvtrktrzwuzeddo'},{appOrigin:'https://careerdevglobal-nine.vercel.app'},{hostUri:''},{redirectUri:'https://elsewhere.example.test/callback'},{appName:''}])assert.equal(oauthAcceptanceConfig({...input(),...override}),null);
});
test('scopes preserve least privilege and write includes corresponding read',()=>{
 const cfg=oauthAcceptanceConfig(input());assert.deepEqual(cfg.scopes,['users:read','event_types:read','scheduled_events:write','webhooks:write']);
 assert.ok(grantedScopesCover(cfg.scopes,['scheduled_events:read']));assert.equal(grantedScopesCover(['scheduled_events:read'],['scheduled_events:write']),false);
});
test('authorize sends exact callback and S256, storing hash rather than raw state',async()=>{
 const f=fixture();const url=await f.begin();assert.equal(url.searchParams.get('redirect_uri'),f.config.redirectUri);assert.equal(url.searchParams.get('scope'),f.config.scopes.join(' '));assert.equal(url.searchParams.get('code_challenge_method'),'S256');
 const state=url.searchParams.get('state'),row=f.states.get(await sha256(state));assert.ok(row);assert.ok(!JSON.stringify(row).includes(state));assert.equal(url.searchParams.get('code_challenge'),await sha256(row.code_verifier));
});
test('OAuth callback consumes state once and encrypts both returned credentials',async()=>{
 const f=fixture(),url=await f.begin(),state=url.searchParams.get('state');
 const rs=await Promise.all([f.callback(state),f.callback(state)]);assert.equal(f.exchanges(),1);assert.equal(rs.filter(r=>r.headers.get('Location').endsWith('=connected')).length,1);
 const row=f.connection();assert.ok(!JSON.stringify(row).includes(f.access));assert.ok(!JSON.stringify(row).includes(f.refresh));assert.ok((await decryptCalendlyValue(row.access_token_ciphertext,f.config.encryptionKey))===f.access);
 assert.equal(row.calendly_user_uri,hostUri);
});
test('expired, missing and forged callback state never reach provider',async()=>{
 const f=fixture(),url=await f.begin();for(const row of f.states.values())row.expires_at='2000-01-01T00:00:00Z';
 for(const state of [url.searchParams.get('state'),'x'.repeat(43),''])assert.ok((await f.callback(state)).headers.get('Location').endsWith('=expired'));
 assert.equal(f.exchanges(),0);
});
test('designated host mismatch and incomplete scopes cannot save a connection',async()=>{
 for(const options of [{wrongHost:true},{missingScope:true}]){const f=fixture(options),url=await f.begin();assert.ok((await f.callback(url.searchParams.get('state'))).headers.get('Location').endsWith('=error'));assert.equal(f.connection(),undefined);}
});
test('pending or inactive coach and anonymous sessions cannot start OAuth',async()=>{
 for(const options of [{pending:true},{inactive:true},{anonymous:true}]){const f=fixture(options);assert.ok([401,403].includes((await f.authorize()).status));assert.equal(f.states.size,0);}
});
test('unconfigured handler and wrong origins do not touch database or provider',async()=>{
 const off=createOAuthHandler({config:null,db:null});assert.equal((await off(new Request(backendUrl))).status,404);
 const f=fixture();const r=await f.handler(new Request(f.config.redirectUri,{method:'POST',headers:{Origin:'https://untrusted.example.test'},body:'{}'}));assert.equal(r.status,404);assert.equal(f.calls.length,0);
});
test('database state insert failure is sanitized',async()=>{
 const f=fixture({stateWriteError:true});const r=await f.authorize();assert.equal(r.status,503);assert.equal(f.exchanges(),0);assert.ok(!(await r.text()).includes('fixture'));
});

test('acceptance event type listing stays on the designated host without legacy booking endpoint',async()=>{
 const f=fixture(),url=await f.begin();await f.callback(url.searchParams.get('state'));
 const r=await f.handler(new Request(f.config.redirectUri,{method:'POST',headers:{Origin:appOrigin,Authorization:'Bearer session'},body:JSON.stringify({action:'event_types'})}));
 assert.equal(r.status,200);const body=await r.json();assert.equal(body.event_types.length,1);assert.equal(body.event_types[0].name,'Synthetic type');
});
test('status explicitly excludes encrypted and plaintext credentials',async()=>{
 const f=fixture(),url=await f.begin();await f.callback(url.searchParams.get('state'));
 const r=await f.handler(new Request(f.config.redirectUri,{method:'POST',headers:{Origin:appOrigin,Authorization:'Bearer session'},body:JSON.stringify({action:'status'})}));
 const body=await r.json();assert.equal(body.connected,true);assert.equal(body.redirect_uri,f.config.redirectUri);assert.ok(!JSON.stringify(body).includes(f.access));
 assert.ok(!('access_token_ciphertext' in body.connection));assert.ok(!('refresh_token_ciphertext' in body.connection));
});
