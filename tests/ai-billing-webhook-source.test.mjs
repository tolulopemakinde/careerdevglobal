// Behavioral tests run the shipped Edge entrypoint with only external dependencies replaced.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {createHmac,webcrypto} from 'node:crypto';
import vm from 'node:vm';
const source=readFileSync(new URL('../supabase/functions/careerdev-paystack-webhook/index.ts',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
const javascript=stripTypeScriptTypes(source);
const secret='sk_test_offline_fixture';
function boot({sub=null,marketplace=null,rpcResult={processed:true},apply=async()=>({processed:true})}={}){
 let handler,calls=[],rows=[];
 const sb={
  from(table){const query={select(){return query},eq(){return query},neq(){return query},update(){return query},
   async maybeSingle(){return {data:table==='marketplace_transactions'?marketplace:null,error:null}},
   insert(row){rows.push({table,row});query.single=async()=>({data:{...row,id:'fixture-event'},error:null});return query},
   async then(resolve){resolve({error:null})}
  };return query},
  async rpc(name,args){calls.push({name,args});return {data:rpcResult,error:null}}
 };
 const sandbox={Deno:{env:{get:name=>({SUPABASE_URL:'https://example.test',PAYSTACK_SECRET_KEY:secret}[name]??'fixture-service')},serve:fn=>handler=fn},
  createClient:()=>sb,exactSubscription:async()=>sub,transactionReference:data=>data.transaction?.reference??data.reference??'',
  applyRecordedEvent:apply,Response,Request,URL,TextEncoder,TextDecoder,Uint8Array,crypto:webcrypto,console};
 vm.runInNewContext(javascript,sandbox);
 return {send:async(event,{signature=true,raw}={})=>{const body=raw??JSON.stringify(event);return handler(new Request('https://example.test/webhook',{method:'POST',headers:signature?{'x-paystack-signature':createHmac('sha512',secret).update(body).digest('hex')}:{'x-paystack-signature':'0'.repeat(128)},body}))},rows,calls};
}
test('W07 wrong HMAC never inserts a payment event',async()=>{const h=boot();const r=await h.send({event:'charge.success',data:{reference:'r'}},{signature:false});assert.equal(r.status,401);assert.equal(h.rows.length,0)});
test('signed malformed JSON is rejected before persistence',async()=>{const h=boot();assert.equal((await h.send(null,{raw:'{'})).status,400);assert.equal(h.rows.length,0)});
test('unsupported signed event is rejected',async()=>{const h=boot();assert.equal((await h.send({event:'made.up',data:{}})).status,400);assert.equal(h.rows.length,0)});
test('W13 AI and marketplace identity collision never changes either ledger',async()=>{const h=boot({sub:{id:'a'},marketplace:{id:'m'}});assert.equal((await h.send({event:'charge.success',data:{reference:'shared'}})).status,409);assert.equal(h.rows.length,0);assert.equal(h.calls.length,0)});
test('marketplace charge delegates only to marketplace transaction function',async()=>{const h=boot({marketplace:{id:'m'}});const r=await h.send({event:'charge.success',data:{reference:'market-r'}});assert.equal(r.status,200);assert.equal(h.rows[0].table,'marketplace_payment_webhook_events');assert.equal(h.calls[0].name,'apply_paystack_webhook_state')});
test('AI charge never invokes marketplace transaction function',async()=>{const h=boot({sub:{id:'a'}});const r=await h.send({event:'charge.success',data:{reference:'CDG-AI-fixture'}});assert.equal(r.status,200);assert.equal(h.rows[0].table,'ai_agent_subscription_webhook_events');assert.equal(h.calls.length,0)});
test('AI refund is retained for reconciliation without mutating marketplace',async()=>{const h=boot({sub:{id:'a'}});const r=await h.send({event:'refund.processed',data:{reference:'CDG-AI-fixture'}});assert.equal(r.status,409);assert.equal(h.rows.length,1);assert.equal(h.calls.length,0)});
test('provider verification failure is retryable and never acknowledged as processed',async()=>{const h=boot({sub:{id:'a'},apply:async()=>{throw Error('Provider unavailable')}});const r=await h.send({event:'charge.success',data:{reference:'CDG-AI-fixture'}});assert.equal(r.status,503);assert.equal((await r.json()).processed,false)});
