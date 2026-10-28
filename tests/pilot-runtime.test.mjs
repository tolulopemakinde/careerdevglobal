import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { buildNoAiFallback } from '../supabase/functions/careerdev-ai-agent-runtime/fallback.ts';

function runtime({mode='ai_optional',role='client',owner='user',allowed=true,active=true,persistError=false}={}) {
 let handler; const writes=[]; const calls=[];
 const rows={profiles:{role,status:'active'},ai_agent_execution_requests:{id:'request',status:'prepared',requested_by:owner,execution_id:'execution',input_payload:{goals:['Portfolio']}},ai_agent_executions:{id:'execution',agent_id:'agent'},ai_agent_registry:{id:'agent',agent_key:'career_coach_agent',active,ai_dependency_mode:mode},ai_agent_configuration_snapshots:[{config_type:'prompt',configuration:{}},{config_type:'model',configuration:{}}]};
 const sb={auth:{getUser:async()=>({data:{user:{id:'user'}}})},from(table){let writing=false;const q={select(){return q},eq(){return q},update(value){writing=true;writes.push({table,value});return q},maybeSingle:async()=>({data:rows[table]}),then(resolve){return Promise.resolve({data:rows[table],error:writing&&persistError?{message:'failure'}:null}).then(resolve)}};return q},rpc:async(name)=>{calls.push(name);return {data:name==='get_my_ai_agent_access'?[{allowed}]:{},error:null}}};
 const source=fs.readFileSync(new URL('../supabase/functions/careerdev-ai-agent-runtime/index.ts',import.meta.url),'utf8');
 const js=stripTypeScriptTypes(source).replace(/^import .*;\r?\n/gm,'');
 const context={buildNoAiFallback,createClient:()=>sb,Deno:{env:{get:name=>name==='SENTRY_DSN'?undefined:'synthetic'},serve:fn=>handler=fn},Response,crypto,URL,fetch:()=>{throw Error('Unexpected network call')},console};
 vm.runInNewContext(js,context);
 return {handler,writes,calls};
}
const request=()=>new Request('https://synthetic.invalid',{method:'POST',headers:{Authorization:'Bearer synthetic'},body:JSON.stringify({request_id:'request'})});
test('authenticated optional runtime persists fallback without provider or credits',async()=>{
 const {handler,writes,calls}=runtime();const response=await handler(request());assert.equal(response.status,200);
 assert.equal((await response.json()).output.generated_by_ai,false);assert.equal(writes[0].value.status,'awaiting_human_review');assert.ok(!calls.includes('reserve_ai_credits'));
});
test('all caller roles denied for Group C before persistence',async()=>{
 for(const role of ['client','coach','staff','admin']){const {handler,writes}=runtime({role,mode:'ai_required'});assert.equal((await handler(request())).status,409);assert.equal(writes.length,0);}
});
test('ownership and entitlement denial',async()=>{
 for(const options of [{owner:'other'},{allowed:false}]){const {handler,writes}=runtime(options);assert.equal((await handler(request())).status,403);assert.equal(writes.length,0);}
});
test('unauthenticated, inactive and persistence failure are not success',async()=>{
 const {handler}=runtime();assert.equal((await handler(new Request('https://synthetic.invalid',{method:'POST'}))).status,401);
 assert.equal((await runtime({active:false}).handler(request())).status,409);
 assert.equal((await runtime({persistError:true}).handler(request())).status,500);
});
