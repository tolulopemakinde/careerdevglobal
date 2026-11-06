import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {createHash,webcrypto} from 'node:crypto';
const capability='1'.repeat(64),digest=createHash('sha256').update(capability).digest('hex');
function boot({url='https://yyevuwvtrktrzwuzeddo.supabase.co',mode='test',global=false,refund=false,prior=null,expires=new Date(Date.now()+3*3600000).toISOString()}={}){
 let handler;const provider=[],tables=[];
 const source=readFileSync(new URL('./helpers/ai-billing-matched-acceptance.ts.fixture',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/const capabilityHash='[^']+';/,"const capabilityHash='"+digest+"';").replace(/const capabilityExpires='[^']+';/,"const capabilityExpires='"+expires+"';");
 const sb={from(table){tables.push(table);const q={select(){return q},eq(){return q},insert(){return q},async maybeSingle(){return {data:prior,error:null}},async single(){return {data:table==='ai_billing_release_config'?{self_service_enabled:global}:{enabled:refund},error:null}},then(resolve){resolve({error:null})}};return q}};
 vm.runInNewContext(stripTypeScriptTypes(source),{Deno:{env:{get:n=>n==='SUPABASE_URL'?url:n==='PAYSTACK_SECRET_KEY'?(mode==='test'?'sk_test_offline':'sk_live_offline'):'fixture-config'},serve:fn=>handler=fn},createClient:()=>sb,paystackRequest:async(...args)=>{provider.push(args);throw Error('Offline provider must not be reached');},providerRenewalStopped:()=>false,Request,Response,URL,Date,crypto:webcrypto,TextEncoder,AbortSignal});
 return {provider,tables,send:(action='initialize',token=capability)=>handler(new Request(url,{method:'POST',headers:{'x-billing-test-capability':token},body:JSON.stringify({action})}))};
}
test('matched acceptance rejects another project before provider/database work',async()=>{const h=boot({url:'https://production.example.test'});assert.equal((await h.send()).status,403);assert.equal(h.tables.length,0);assert.equal(h.provider.length,0)});
test('matched acceptance rejects LIVE credentials before provider/database work',async()=>{const h=boot({mode:'live'});assert.equal((await h.send()).status,403);assert.equal(h.tables.length,0);assert.equal(h.provider.length,0)});
test('public anon bearer is insufficient without the private operator capability',async()=>{const h=boot();assert.equal((await h.send('initialize','2'.repeat(64))).status,401);assert.equal(h.tables.length,0);assert.equal(h.provider.length,0)});
for(const expires of [new Date(Date.now()-1000).toISOString(),'invalid-expiry'])test('expired or invalid operator approval is denied '+expires,async()=>{const h=boot({expires});assert.equal((await h.send()).status,401);assert.equal(h.tables.length,0);assert.equal(h.provider.length,0)});
for(const options of [{global:true},{refund:true}])test('matched helper requires both global gates off '+JSON.stringify(options),async()=>{const h=boot(options);assert.equal((await h.send()).status,409);assert.equal(h.provider.length,0)});
test('unknown caller-selected actions cannot reach provider work',async()=>{const h=boot();assert.equal((await h.send('refund')).status,400);assert.equal(h.provider.length,0)});
test('uncertain initialization retains its claim and cannot initialize another payment',async()=>{const h=boot({prior:{status:'initialization_claimed',results:[]}});const r=await h.send();assert.equal(r.status,200);assert.equal((await r.json()).reused,true);assert.equal(h.provider.length,0)});
test('almost expired operator window cannot start a payment',async()=>{const h=boot({expires:new Date(Date.now()+5*60000).toISOString()});assert.equal((await h.send()).status,409);assert.equal(h.provider.length,0)});
