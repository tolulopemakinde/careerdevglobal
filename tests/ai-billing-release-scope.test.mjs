import test from 'node:test';
import assert from 'node:assert/strict';
import {billingActionAllowed} from '../supabase/functions/_shared/ai-billing-release.ts';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
const owner='fixture-owner',projectUrl='https://yyevuwvtrktrzwuzeddo.supabase.co';
const input={projectUrl,secret:'sk_test_offline_fixture',userId:owner,action:'checkout',planKey:'fresher',interval:'monthly',currency:'NGN'};
const scope=()=>({user_id:owner,enabled:true,approval_reference:'owner-paid-fresher-20261104-a',project_ref:'yyevuwvtrktrzwuzeddo',plan_key:'fresher',billing_interval:'monthly',currency:'NGN',amount_minor:750000,monthly_credits:25,created_at:new Date(Date.now()-1000).toISOString(),expires_at:new Date(Date.now()+3600000).toISOString()});
function database({global=false,authorization=scope(),plan={},checkouts=[],cancellations=[],payment={},subscription={},errorTable=null}={}){
 const tables=[];
 return {tables,from(table){tables.push(table);const filters={};const q={select(){return q},eq(k,v){filters[k]=v;return q},
  async maybeSingle(){return {data:table==='ai_billing_release_config'?{self_service_enabled:global}:authorization,error:table===errorTable?{message:'Unavailable'}:null}},
  async single(){return {data:table==='ai_agent_subscription_plans'?{active:true,monthly_price_ngn:7500,monthly_credits:25,...plan}:table==='ai_agent_subscriptions'?{user_id:owner,plan_key:'fresher',billing_interval:'monthly',currency:'NGN',amount:7500,paystack_transaction_reference:'CDG-AI-fixture',...subscription}:{subscription_id:'sub',amount_minor:750000,currency:'NGN',...payment},error:table===errorTable?{message:'Unavailable'}:null}},
  then(resolve){resolve({data:filters.action==='cancel'?cancellations:checkouts,error:table===errorTable?{message:'Unavailable'}:null})}
 };return q}};
}
test('existing global release behavior is preserved without reading TEST scopes',async()=>{const sb=database({global:true});assert.equal(await billingActionAllowed(sb,{...input,projectUrl:'https://production.example.test',secret:'sk_live_offline'}),true);assert.deepEqual(sb.tables,['ai_billing_release_config'])});
test('disabled global gate alone cannot authorize a checkout',async()=>assert.equal(await billingActionAllowed(database({authorization:null}),input),false));
test('approved isolated TEST owner may open only the one exact budget',async()=>assert.equal(await billingActionAllowed(database(),input),true));
for(const change of [{projectUrl:'https://production.example.test'},{secret:'sk_live_offline'},{userId:'another-user'},{action:'upgrade'},{planKey:'starter'},{interval:'annual'},{currency:'USD'}])test('TEST scope denies '+JSON.stringify(change),async()=>assert.equal(await billingActionAllowed(database(),{...input,...change}),false));
for(const change of [{enabled:false},{amount_minor:1500000},{monthly_credits:50},{project_ref:'another-project'},{approval_reference:'unapproved'},{expires_at:'bad-date'},{expires_at:new Date(Date.now()-1000).toISOString()},{expires_at:new Date(Date.now()+48*3600000).toISOString()}])test('invalid authorization is denied '+JSON.stringify(change),async()=>assert.equal(await billingActionAllowed(database({authorization:{...scope(),...change}}),input),false));
for(const errorTable of ['ai_billing_release_config','ai_billing_test_authorizations','ai_agent_subscription_plans','ai_billing_operations'])test(errorTable+' outage fails closed',async()=>assert.equal(await billingActionAllowed(database({errorTable}),input),false));
test('changed approved price or allowance cannot silently spend a different budget',async()=>{assert.equal(await billingActionAllowed(database({plan:{monthly_price_ngn:15000}}),input),false);assert.equal(await billingActionAllowed(database({plan:{monthly_credits:50}}),input),false)});
for(const status of ['prepared','provider_requested'])test('same pending checkout remains recoverable '+status,async()=>assert.equal(await billingActionAllowed(database({checkouts:[{id:'op',status,subscription_id:'sub'}]}),input),true));
test('confirmed checkout consumes the one-payment scope permanently',async()=>assert.equal(await billingActionAllowed(database({checkouts:[{id:'op',status:'confirmed',subscription_id:'sub'}]}),input),false));
test('multiple checkout operations fail closed',async()=>assert.equal(await billingActionAllowed(database({checkouts:[{},{}]}),input),false));
const paid={checkouts:[{id:'op',status:'confirmed',subscription_id:'sub'}]};
test('one exact verified receipt permits the approved renewal stop',async()=>assert.equal(await billingActionAllowed(database(paid),{...input,action:'cancel'}),true));
test('renewal stop cannot target an unverified or differently attributed payment',async()=>{assert.equal(await billingActionAllowed(database(),{...input,action:'cancel'}),false);assert.equal(await billingActionAllowed(database({...paid,payment:{subscription_id:'other'}}),{...input,action:'cancel'}),false);assert.equal(await billingActionAllowed(database({...paid,subscription:{user_id:'other'}}),{...input,action:'cancel'}),false)});
test('confirmed renewal stop consumes scope without another provider operation',async()=>assert.equal(await billingActionAllowed(database({...paid,cancellations:[{id:'cancel',status:'confirmed',subscription_id:'sub'}]}),{...input,action:'cancel'}),false));

function shippedCheckout({authenticatedUser=owner}={}){
 let handler,operation=null,providerWrites=0,prepares=0;
 const sub={id:'sub',user_id:owner,plan_key:'fresher',billing_interval:'monthly',amount:7500,currency:'NGN',paystack_plan_code:'PLN_fixture',paystack_transaction_reference:'CDG-AI-'+'b'.repeat(32)};
 const sb={auth:{getUser:async()=>({data:{user:{id:authenticatedUser,email:'offline-fixture@example.com'}},error:null})},from(table){const filters={};let change;const q={select(){return q},eq(k,v){filters[k]=v;return q},update(v){change=v;return q},
  async maybeSingle(){return {data:table==='ai_billing_release_config'?{self_service_enabled:false}:scope(),error:null}},
  async single(){return {data:{active:true,monthly_price_ngn:7500,monthly_credits:25},error:null}},
  then(resolve){if(change&&operation)Object.assign(operation,change);resolve({data:operation?[operation]:[],error:null})}
 };return q},async rpc(name){
  if(name==='prepare_ai_subscription_checkout'){prepares++;operation??={id:'op',subscription_id:'sub',status:'prepared',subscription:sub};return {data:operation,error:null}}
  if(name==='claim_ai_billing_operation'){const allowed=operation.status==='prepared';if(allowed)operation.status='provider_requested';return {data:allowed,error:null}}
  throw Error('Unexpected RPC');
 }};
 const source=readFileSync(new URL('../supabase/functions/careerdev-ai-subscription-checkout/index.ts',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
 vm.runInNewContext(stripTypeScriptTypes(source),{Deno:{env:{get:n=>({SUPABASE_URL:projectUrl,PAYSTACK_SECRET_KEY:'sk_test_offline',SUPABASE_ANON_KEY:'offline-anon',CAREERDEV_APP_URL:'https://preview.example.test'}[n]??'offline-service')},serve:fn=>handler=fn},createClient:()=>sb,billingActionAllowed,providerPlanCode:p=>p.plan_code,paystackRequest:async(_secret,path,body)=>{if(path.startsWith('/plan/'))return {plan_code:'PLN_fixture',currency:'NGN',amount:750000,interval:'monthly'};assert.equal(path,'/transaction/initialize');providerWrites++;assert.equal(body.amount,'750000');assert.equal(body.currency,'NGN');assert.equal(body.metadata.careerdev_ai_subscription_id,'sub');return {reference:sub.paystack_transaction_reference,authorization_url:'https://checkout.paystack.com/offline-fixture'};},Request,Response,URL,Date});
 return {send:(body={plan_key:'fresher',billing_interval:'monthly',currency:'NGN'})=>handler(new Request(projectUrl,{method:'POST',headers:{Authorization:'Bearer offline-owner'},body:JSON.stringify(body)})),writes:()=>providerWrites,prepares:()=>prepares};
}
test('shipped authenticated TEST checkout initializes once and recovers the same URL',async()=>{const h=shippedCheckout();const first=await h.send(),second=await h.send();assert.equal(first.status,200);assert.equal(second.status,200);assert.equal((await first.json()).authorization_url,(await second.json()).authorization_url);assert.equal(h.writes(),1)});
test('caller cannot impersonate the approved owner using request JSON',async()=>{const h=shippedCheckout({authenticatedUser:'another-user'});assert.equal((await h.send({plan_key:'fresher',billing_interval:'monthly',currency:'NGN',user_id:owner})).status,503);assert.equal(h.writes(),0);assert.equal(h.prepares(),0)});
