import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {
 assessGatewaySyntheticEligibility,compareGatewaySyntheticModels,
 GATEWAY_PILOT_TARGETS,GATEWAY_SYNTHETIC_CASE,
} from "../lib/ai/pilot/gateway-synthetic-evaluation.mjs";

const cfg=()=>({
 CAREERDEV_GATEWAY_SYNTHETIC_EVAL:"true",
 CAREERDEV_GATEWAY_ENVIRONMENT:"isolated-gateway-synthetic",
 CAREERDEV_GATEWAY_OWNER_APPROVED:"true",
 CAREERDEV_GATEWAY_KEY_BUDGET_VERIFIED:"true",
 CAREERDEV_GATEWAY_FUNDS_VERIFIED:"true",
 CAREERDEV_GATEWAY_AUTOTOPUP_DISABLED:"true",
 CAREERDEV_GATEWAY_NO_BYOK_VERIFIED:"true",
 AI_GATEWAY_API_KEY:"dummy-gateway-key-not-authentic",
});
test("gateway request needs only one gateway key; no separate provider account or Supabase fixture",()=>{
 const e=cfg(),r=assessGatewaySyntheticEligibility(e);
 assert.equal(r.allowed,true);
 assert.equal(r.productionAuthorized,false);
 assert.equal(GATEWAY_PILOT_TARGETS.length,2);
 assert.equal(e.OPENAI_PILOT_API_KEY,undefined);
 assert.equal(e.GROQ_PILOT_API_KEY,undefined);
});
test("missing key, opt-in, cap or owner approval blocks any inference",()=>{
 for(const field of Object.keys(cfg())){
   const env=cfg();delete env[field];
   const r=assessGatewaySyntheticEligibility(env);
   assert.equal(r.allowed,false,"must fail closed without "+field);
   assert.ok(r.blockers.length>0);
 }
});
test("CI/Vercel/production refuse execution even with approval booleans",()=>{
 for(const e of [{CI:"true"},{VERCEL:"1"},{NODE_ENV:"production"}]){
   const r=assessGatewaySyntheticEligibility({...cfg(),...e});
   assert.equal(r.allowed,false);
   assert.ok(r.blockers.includes("RUNTIME_BLOCKED"));
 }
});
test("two matched synthetic prompts, one permitted provider each, no BYOK/fallback/retries",async()=>{
 const requests=[];
 let now=100;
 const output=await compareGatewaySyntheticModels({
  env:cfg(),clock:()=>{now+=10;return now;},
  generate:async q=>{
   requests.push(q);
   return {text:"fictional career guidance only",usage:{inputTokens:30,outputTokens:12}};
  },
 });
 assert.equal(requests.length,2);
 assert.deepEqual(requests.map(r=>r.model),["openai/gpt-5.4-mini","openai/gpt-oss-120b"]);
 assert.deepEqual(requests.map(r=>r.providerOptions.gateway.only),[["openai"],["groq"]]);
 for(const x of requests){
  assert.equal(x.prompt,GATEWAY_SYNTHETIC_CASE.prompt);
  assert.equal(x.maxRetries,0);
  assert.equal(x.maxOutputTokens,160);
  assert.equal(x.providerOptions.gateway.byok,undefined);
  assert.equal(x.providerOptions.gateway.models,undefined);
 }
 assert.deepEqual(output.results.map(r=>r.requiredProvider),["openai","groq"]);
 assert.equal(output.status,"REQUIRES_HUMAN_REVIEW");
 assert.equal(output.productionAuthorized,false);
});
test("first failed gateway request stops before second instead of silently falling back",async()=>{
 const calls=[];
 await assert.rejects(()=>compareGatewaySyntheticModels({
  env:cfg(),generate:async opts=>{calls.push(opts.model);throw Error("secret server error");}
 }),e=>e.code==="GATEWAY_PROVIDER_ATTEMPT_FAILED"&&!e.message.includes("secret"));
 assert.equal(calls.length,1);
});
test("empty, excessively long, or invalid outputs cannot be reported as valid research",async()=>{
 for(const text of [""," ".repeat(20),"x".repeat(1801)]){
   await assert.rejects(()=>compareGatewaySyntheticModels({
      env:cfg(),generate:async()=>({text})
   }),e=>e.code==="INVALID_SYNTHETIC_RESPONSE");
 }
});
test("manual runner with missing credentials prints HOLD and schedules zero requests",()=>{
 const env={PATH:process.env.PATH,HOME:process.env.HOME,CI:"true"};
 const r=spawnSync(process.execPath,[new URL("./run-ai-gateway-synthetic.mjs",import.meta.url).pathname],{
  encoding:"utf8",timeout:6000,env,
 });
 assert.equal(r.status,2);
 const outcome=JSON.parse(r.stdout);
 assert.equal(outcome.status,"HOLD");
 assert.equal(outcome.scheduledRequests,0);
 assert.equal(outcome.productionAuthorized,false);
});
