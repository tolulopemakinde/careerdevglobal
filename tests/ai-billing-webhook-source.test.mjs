// Behavioral tests run the shipped Edge entrypoint with only external dependencies replaced.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {createHmac,webcrypto} from 'node:crypto';
import vm from 'node:vm';
import {transactionReference} from '../supabase/functions/_shared/ai-billing-reconcile.ts';
const source=readFileSync(new URL('../supabase/functions/careerdev-paystack-webhook/index.ts',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
const javascript=stripTypeScriptTypes(source);
const secret='sk_test_offline_fixture';
function boot({sub=null,marketplace=null,rpcResult={processed:true},apply=async()=>({processed:true}),storageError=false,quarantineError=false,lookupError=false,settleDuringQuarantine=false,disappearDuringQuarantine=false}={}){
 let handler,calls=[],rows=[],saved=new Map(),updates=[];
 const sb={
  from(table){let filters={},excluded={},change;const query={select(){return query},eq(k,v){filters[k]=v;return query},neq(k,v){excluded[k]=v;return query},update(value){change=value;updates.push({table,value});return query},
   async maybeSingle(){
    if(lookupError)return {data:null,error:{message:'Database unavailable'}};
    if(table==='marketplace_transactions')return {data:marketplace,error:null};
    const entry=[...saved.values()].find(row=>Object.entries(filters).every(([k,v])=>row[k]===v));
    if(change){
     if(quarantineError)return {data:null,error:{message:'Quarantine unavailable'}};
     if(entry&&settleDuringQuarantine)entry.processing_status='processed';
     if(entry&&disappearDuringQuarantine){saved.delete(entry.provider_event_reference);return {data:null,error:null}}
     if(entry&&Object.entries(excluded).some(([k,v])=>entry[k]===v))return {data:null,error:null};
     if(entry)Object.assign(entry,change);
    }
    return {data:entry??null,error:null};
   },
   async single(){return query.maybeSingle()},
   insert(row){rows.push({table,row});query.single=async()=>{
    if(storageError||saved.has(row.provider_event_reference)||(table==='marketplace_payment_webhook_events'&&Object.hasOwn(row,'verification_source')))return {data:null,error:{message:'Insert failed'}};
    const entry={...row,id:'fixture-event-'+saved.size};saved.set(row.provider_event_reference,entry);return {data:entry,error:null};
   };return query},
   async then(resolve){resolve(await query.maybeSingle())}
  };return query},
  async rpc(name,args){calls.push({name,args});return {data:rpcResult,error:null}}
 };
 const sandbox={Deno:{env:{get:name=>({SUPABASE_URL:'https://example.test',PAYSTACK_SECRET_KEY:secret}[name]??'fixture-service')},serve:fn=>handler=fn},
  createClient:()=>sb,exactSubscription:async()=>sub,transactionReference,
  applyRecordedEvent:apply,Response,Request,URL,TextEncoder,TextDecoder,Uint8Array,crypto:webcrypto,console};
 vm.runInNewContext(javascript,sandbox);
 return {send:async(event,{signature=true,raw}={})=>{const body=raw??JSON.stringify(event);return handler(new Request('https://example.test/webhook',{method:'POST',headers:signature?{'x-paystack-signature':createHmac('sha512',secret).update(body).digest('hex')}:{'x-paystack-signature':'0'.repeat(128)},body}))},rows,calls,saved,updates};
}
test('W07 wrong HMAC never inserts a payment event',async()=>{const h=boot();const r=await h.send({event:'charge.success',data:{reference:'r'}},{signature:false});assert.equal(r.status,401);assert.equal(h.rows.length,0)});
test('signed malformed JSON is rejected before persistence',async()=>{const h=boot();assert.equal((await h.send(null,{raw:'{'})).status,400);assert.equal(h.rows.length,0)});
test('unsupported signed event is rejected',async()=>{const h=boot();assert.equal((await h.send({event:'made.up',data:{}})).status,400);assert.equal(h.rows.length,0)});
test('W13 AI and marketplace identity collision never changes either ledger',async()=>{const h=boot({sub:{id:'a'},marketplace:{id:'m'}});assert.equal((await h.send({event:'charge.success',data:{reference:'shared'}})).status,409);assert.equal(h.rows.length,0);assert.equal(h.calls.length,0)});
test('marketplace charge delegates only to marketplace transaction function',async()=>{const h=boot({marketplace:{id:'m'}});const r=await h.send({event:'charge.success',data:{reference:'market-r'}});assert.equal(r.status,200);assert.equal(h.rows[0].table,'marketplace_payment_webhook_events');assert.equal(h.calls[0].name,'apply_paystack_webhook_state')});
test('AI charge never invokes marketplace transaction function',async()=>{const h=boot({sub:{id:'a'}});const r=await h.send({event:'charge.success',data:{reference:'CDG-AI-fixture'}});assert.equal(r.status,200);assert.equal(h.rows[0].table,'ai_agent_subscription_webhook_events');assert.equal(h.calls.length,0)});
test('marketplace event identity survives harmless JSON changes',async()=>{const h=boot({marketplace:{id:'m'}});await h.send({event:'charge.success',data:{id:123,reference:'market-r',amount:1000}});await h.send({data:{amount:1000,reference:'market-r',id:123},event:'charge.success'});assert.equal(h.rows[0].row.provider_event_reference,h.rows[1].row.provider_event_reference);assert.notEqual(h.rows[0].row.payload_hash,h.rows[1].row.payload_hash)});
test('AI refund is acknowledged for reconciliation without mutating marketplace',async()=>{const h=boot({sub:{id:'a'}});const r=await h.send({event:'refund.processed',data:{reference:'CDG-AI-fixture'}});assert.equal(r.status,200);assert.equal((await r.json()).processed,false);assert.equal(h.saved.size,1);assert.equal(h.calls.length,0)});
test('actual refund transaction_reference cannot fall into marketplace routing',async()=>{const h=boot();const r=await h.send({event:'refund.processed',data:{transaction_reference:'CDG-AI-fixture',status:'processed'}});assert.equal(r.status,200);assert.equal(h.rows[0].table,'ai_agent_subscription_webhook_events');assert.equal(h.rows[0].row.transaction_reference,'CDG-AI-fixture');assert.equal(h.calls.length,0)});
for(const event of ['charge.dispute.create','charge.dispute.remind','charge.dispute.resolve'])test(event+' is retained for verified operator handling',async()=>{const h=boot({sub:{id:'a'}});const r=await h.send({event,data:{transaction:{reference:'CDG-AI-fixture'}}});assert.equal(r.status,200);assert.equal((await r.json()).reconciliation_required,true);assert.equal(h.rows[0].table,'ai_agent_subscription_webhook_events');assert.equal(h.calls.length,0)});
test('marketplace dispute is durably retained without mutating AI billing',async()=>{const h=boot({marketplace:{id:'m'}});const r=await h.send({event:'charge.dispute.create',data:{transaction:{reference:'market-r'}}});assert.equal(r.status,200);assert.equal(h.saved.size,1);assert.equal(h.calls.length,0)});
test('conflicting webhook references never persist',async()=>{const h=boot();const r=await h.send({event:'charge.success',data:{reference:'one',transaction_reference:'two'}});assert.equal(r.status,503);assert.equal(h.rows.length,0)});
test('provider verification failure is retryable and never acknowledged as processed',async()=>{const h=boot({sub:{id:'a'},apply:async()=>{throw Error('Provider unavailable')}});const r=await h.send({event:'charge.success',data:{reference:'CDG-AI-fixture'}});assert.equal(r.status,503);assert.equal((await r.json()).processed,false)});

test('signed AI events explicitly record webhook HMAC provenance',async()=>{const h=boot({sub:{id:'a'}});const r=await h.send({event:'charge.success',data:{reference:'CDG-AI-fixture'}});assert.equal(r.status,200);assert.equal(h.rows[0].row.verification_source,'webhook_hmac');assert.equal(h.rows[0].row.signature_verified,true)});

test('valid standalone charge is acknowledged only after durable quarantine, without settlement',async()=>{const h=boot();const r=await h.send({event:'charge.success',data:{id:123,reference:'standalone'}});assert.equal(r.status,200);const b=await r.json();assert.equal(b.processed,false);assert.equal(b.reconciliation_required,true);assert.equal(h.saved.size,1);assert.match([...h.saved.values()][0].error_message,/No exact marketplace match/);assert.equal(h.calls.length,0)});
test('duplicate unmatched deliveries retain one logical event and no financial effects',async()=>{const h=boot();const event={event:'charge.success',data:{id:123,reference:'standalone'}};const replies=await Promise.all([h.send(event),h.send(event)]);assert.deepEqual(replies.map(r=>r.status),[200,200]);assert.equal(h.saved.size,1);assert.equal(h.calls.length,0)});
test('unmatched AI lifecycle event is acknowledged without provider or settlement calls',async()=>{const h=boot({apply:async()=>{throw Error('Must not call provider')}});const r=await h.send({event:'invoice.create',data:{subscription_code:'SUB_absent'}});assert.equal(r.status,200);assert.equal((await r.json()).processed,false);assert.equal([...h.saved.values()][0].processing_status,'unmatched');assert.equal(h.calls.length,0)});
test('event storage failure remains retryable',async()=>{const h=boot({storageError:true});const r=await h.send({event:'charge.success',data:{reference:'standalone'}});assert.equal(r.status,503);assert.equal(h.saved.size,0);assert.equal(h.calls.length,0)});
test('quarantine update failure is never acknowledged',async()=>{const h=boot({quarantineError:true});const r=await h.send({event:'charge.success',data:{reference:'standalone'}});assert.equal(r.status,503);assert.equal(h.saved.size,1);assert.equal(h.calls.length,0)});
test('manual-review persistence failure is retryable',async()=>{const h=boot({sub:{id:'a'},quarantineError:true});assert.equal((await h.send({event:'refund.processed',data:{reference:'CDG-AI-fixture'}})).status,503)});
test('correlation database failure is retryable before accepting an event',async()=>{const h=boot({lookupError:true});assert.equal((await h.send({event:'charge.success',data:{reference:'standalone'}})).status,503);assert.equal(h.saved.size,0)});
test('same provider identity with different content fails closed and preserves original hash',async()=>{const h=boot();await h.send({event:'charge.success',data:{id:123,reference:'standalone',amount:100}});const original=[...h.saved.values()][0].payload_hash;const r=await h.send({event:'charge.success',data:{id:123,reference:'standalone',amount:200}});assert.equal(r.status,409);assert.equal(h.saved.size,1);assert.equal([...h.saved.values()][0].payload_hash,original);assert.equal(h.calls.length,0)});
test('concurrent processed state wins over quarantine without being downgraded',async()=>{const h=boot({settleDuringQuarantine:true});const r=await h.send({event:'charge.success',data:{id:123,reference:'standalone'}});assert.equal(r.status,200);const body=await r.json();assert.equal(body.processed,true);assert.equal(body.duplicate,true);assert.equal([...h.saved.values()][0].processing_status,'processed');assert.equal(h.calls.length,0)});
test('disappearing quarantine row is retryable rather than falsely acknowledged',async()=>{const h=boot({disappearDuringQuarantine:true});assert.equal((await h.send({event:'charge.success',data:{id:123,reference:'standalone'}})).status,503);assert.equal(h.calls.length,0)});
