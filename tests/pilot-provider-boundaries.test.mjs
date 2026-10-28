import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';

const pipelines=['careerdev-intake-engine','careerdev-intake-engine-v2','careerdev-document-processor','careerdev-document-fact-classifier','careerdev-document-intelligence','careerdev-ai-intake-answer-intelligence','careerdev-ai-service-execution-agent','careerdev-ai-revision-execution-agent','careerdev-career-intelligence-report'];
function pausedHandler(role='client',valid=true){
 let handler;
 const query={select(){return query},eq(){return query},maybeSingle:async()=>({data:{role,status:'active'}})};
 const sb={auth:{getUser:async()=>({data:{user:valid?{id:'synthetic'}:null},error:valid?null:{message:'invalid'}})},from:()=>query};
 const source=fs.readFileSync(new URL('../supabase/functions/_shared/pilot-paused.ts',import.meta.url),'utf8');
 const js=stripTypeScriptTypes(source).replace(/^import .*;\r?\n/gm,'').replace('export function','function');
 const context={createClient:()=>sb,Deno:{env:{get:()=> 'synthetic'},serve:fn=>handler=fn},Response,fetch:()=>{throw Error('Provider/network call attempted')}};
 vm.runInNewContext(js+'\nservePausedPilotPipeline("synthetic");',context);return handler;
}
for(const pipeline of pipelines)test(`${pipeline} has an authenticated provider-free pause`,async()=>{
 const source=fs.readFileSync(new URL(`../supabase/functions/${pipeline}/index.ts`,import.meta.url),'utf8');
 assert.ok(source.includes(`servePausedPilotPipeline('${pipeline}')`));
 for(const role of ['client','coach','staff','admin']){
  const response=await pausedHandler(role)(new Request('https://synthetic.invalid',{method:'POST',headers:{Authorization:'Bearer synthetic'}}));
  assert.equal(response.status,409);const body=await response.json();assert.equal(body.code,'PILOT_AI_PAUSED');assert.equal(body.generated_by_ai,false);
 }
});
test('paused paths reject missing and invalid authentication',async()=>{
 assert.equal((await pausedHandler()(new Request('https://synthetic.invalid',{method:'POST'}))).status,401);
 assert.equal((await pausedHandler('client',false)(new Request('https://synthetic.invalid',{method:'POST',headers:{Authorization:'Bearer invalid'}}))).status,401);
});
test('all versioned Edge source has no OpenAI or replacement-provider network URL',()=>{
 const root=new URL('../supabase/functions/',import.meta.url);
 for(const file of fs.readdirSync(root,{recursive:true}).filter(x=>/\.(ts|js)$/.test(x))){
  const source=fs.readFileSync(new URL(file.replaceAll('\\','/'),root),'utf8');
  assert.doesNotMatch(source,/https?:\/\/(?:api\.)?(?:openai\.com|groq\.com|jina\.ai)/i,file);
 }
});
