import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {assessManualAiPilotPreflight} from "../lib/ai/pilot/manual-preflight-policy.mjs";

const configured=()=>({
  CAREERDEV_AI_MODEL_PREFLIGHT:"true",
  CAREERDEV_ISOLATED_TEST_PROJECT_REF:"yyevuwvtrktrzwuzeddo",
  CAREERDEV_PILOT_OWNER_APPROVED:"true",
  CAREERDEV_PILOT_BUDGET_CAP_VERIFIED:"true",
  CAREERDEV_OPENAI_ENFORCED_HARD_LIMIT_VERIFIED:"true",
  CAREERDEV_GROQ_ORG_SPEND_LIMIT_VERIFIED:"true",
  CAREERDEV_GROQ_PILOT_PROJECT_ISOLATED:"true",
  CAREERDEV_GROQ_PILOT_ORG_SEPARATE_FROM_PRODUCTION:"true",
  OPENAI_PILOT_API_KEY:"unit-only-openai-key",
  GROQ_PILOT_API_KEY:"unit-only-groq-key",
  OPENAI_PILOT_MODEL:"synthetic-approved-openai",
  GROQ_PILOT_MODEL:"openai/gpt-oss-120b",
});
test("current no-key environment fails closed without exposing secret material",()=>{
 const v=assessManualAiPilotPreflight({},"catalogue");
 assert.equal(v.allowed,false);
 assert.equal(v.productionAuthorized,false);
 assert.ok(v.blockers.includes("OWNER_APPROVAL_NOT_ATTESTED"));
 assert.ok(v.blockers.includes("DEDICATED_OPENAI_PILOT_KEY_MISSING"));
 assert.ok(v.blockers.includes("DEDICATED_GROQ_PILOT_KEY_MISSING"));
});
test("operator readiness only permits a future manual catalogue GET, never production",()=>{
 const v=assessManualAiPilotPreflight(configured(),"catalogue");
 assert.equal(v.allowed,true);
 assert.equal(v.productionAuthorized,false);
 assert.equal(v.decision,"OPERATOR_PREFLIGHT_ELIGIBLE");
});
test("provider key equality and generic key reuse are rejected",()=>{
 const a=configured();
 for(const change of [
  {GROQ_PILOT_API_KEY:a.OPENAI_PILOT_API_KEY},
  {GROQ_API_KEY:a.GROQ_PILOT_API_KEY},
  {OPENAI_API_KEY:a.OPENAI_PILOT_API_KEY},
  {GROQ_API_KEY:a.OPENAI_PILOT_API_KEY},
  {OPENAI_API_KEY:a.GROQ_PILOT_API_KEY},
 ]){
  const v=assessManualAiPilotPreflight({...a,...change});
  assert.equal(v.allowed,false);
  assert.ok(v.blockers.some(x=>x.includes("KEY")));
 }
});
test("production, CI, Vercel and wrong project cannot pass",()=>{
 for(const change of [
  {NODE_ENV:"production"},{CI:"true"},{VERCEL:"1"},
  {CAREERDEV_ISOLATED_TEST_PROJECT_REF:"ufmhrmzumqkjvaezrmxf"},
  {CAREERDEV_ISOLATED_TEST_PROJECT_REF:"random"},
 ])assert.equal(assessManualAiPilotPreflight({...configured(),...change}).allowed,false);
});
test("missing independent owner approval or spend budget attestation blocks network eligibility",()=>{
 for(const key of ["CAREERDEV_PILOT_OWNER_APPROVED","CAREERDEV_PILOT_BUDGET_CAP_VERIFIED"]){
  const o=configured();delete o[key];
  assert.equal(assessManualAiPilotPreflight(o).allowed,false);
 }
});
test("paid inference stage additionally requires account provenance and test payment isolation",()=>{
 const base=configured();
 const pending=assessManualAiPilotPreflight(base,"inference");
 assert.equal(pending.allowed,false);
 assert.ok(pending.blockers.includes("SYNTHETIC_TEST_ACCOUNTS_UNVERIFIED"));
 assert.ok(pending.blockers.includes("TEST_PAYMENT_ENVIRONMENT_UNVERIFIED"));
 const ready=assessManualAiPilotPreflight({
  ...base,CAREERDEV_TEST_ACCOUNTS_PROVENANCE_VERIFIED:"true",
  CAREERDEV_TEST_PAYMENT_ISOLATION_VERIFIED:"true"
 },"inference");
 assert.equal(ready.allowed,true);
 assert.equal(ready.productionAuthorized,false);
});
test("no unsupported Groq models or invalid OpenAI model IDs",()=>{
 for(const change of [
  {GROQ_PILOT_MODEL:"unknown"},
  {GROQ_PILOT_MODEL:""},
  {OPENAI_PILOT_MODEL:"bad model with spaces"},
 ]){
  const r=assessManualAiPilotPreflight({...configured(),...change});
  assert.equal(r.allowed,false);
 }
});
test("cannot infer the exact pilot secret from report in any case",()=>{
 const a=configured();
 const out=JSON.stringify(assessManualAiPilotPreflight({
  ...a,OPENAI_API_KEY:a.OPENAI_PILOT_API_KEY,
 }));
 assert.equal(out.includes("unit-only"),false);
 assert.equal(out.includes(a.OPENAI_PILOT_API_KEY),false);
});
test("unsupported stage and absent env are rejected",()=>{
 assert.equal(assessManualAiPilotPreflight(null).allowed,false);
 assert.equal(assessManualAiPilotPreflight(configured(),"production").allowed,false);
});

test("manual model-catalogue command sends zero requests when run in CI even with fake attestations",()=>{
 const env={...process.env,...configured(),CI:"true"};
 const r=spawnSync(process.execPath,[new URL("./run-ai-model-connectivity.mjs",import.meta.url).pathname],{
  env,encoding:"utf8",timeout:6000,
 });
 assert.equal(r.status,2);
 const report=JSON.parse(r.stdout.trim());
 assert.equal(report.status,"HOLD");
 assert.equal(report.requestsSent,0);
 assert.equal(report.productionAuthorized,false);
 assert.ok(report.blockers.includes("AUTOMATED_OR_PRODUCTION_ENVIRONMENT_BLOCKED"));
 assert.equal(JSON.stringify(report).includes("unit-only"),false);
});

test("alerts-only OpenAI spending controls never pass as hard spend limits",()=>{
 const x=configured();
 for(const v of [undefined,"false","alerts_only"]){
   const e={...x}; if(v===undefined)delete e.CAREERDEV_OPENAI_ENFORCED_HARD_LIMIT_VERIFIED;
   else e.CAREERDEV_OPENAI_ENFORCED_HARD_LIMIT_VERIFIED=v;
   const r=assessManualAiPilotPreflight(e);
   assert.equal(r.allowed,false);
   assert.ok(r.blockers.includes("OPENAI_HARD_SPEND_LIMIT_NOT_ATTESTED"));
 }
});
test("Groq organization spend limit cannot be replaced by a per-key rate limit",()=>{
 const e=configured();delete e.CAREERDEV_GROQ_ORG_SPEND_LIMIT_VERIFIED;
 const r=assessManualAiPilotPreflight(e);
 assert.equal(r.allowed,false);
 assert.ok(r.blockers.includes("GROQ_ORG_SPEND_LIMIT_NOT_ATTESTED"));
});
test("Groq pilot must not share spending-cap blast radius with production",()=>{
 for(const key of [
   "CAREERDEV_GROQ_PILOT_PROJECT_ISOLATED",
   "CAREERDEV_GROQ_PILOT_ORG_SEPARATE_FROM_PRODUCTION",
 ]){
   const e=configured();delete e[key];
   const r=assessManualAiPilotPreflight(e);
   assert.equal(r.allowed,false);
   assert.ok(r.blockers.some(x=>x==="GROQ_PILOT_PROJECT_NOT_ISOLATED"||
       x==="GROQ_SPEND_LIMIT_COULD_AFFECT_PRODUCTION"));
 }
});
test("legacy aggregate budget boolean is insufficient by itself",()=>{
 const e=configured();
 delete e.CAREERDEV_OPENAI_ENFORCED_HARD_LIMIT_VERIFIED;
 delete e.CAREERDEV_GROQ_ORG_SPEND_LIMIT_VERIFIED;
 delete e.CAREERDEV_GROQ_PILOT_PROJECT_ISOLATED;
 delete e.CAREERDEV_GROQ_PILOT_ORG_SEPARATE_FROM_PRODUCTION;
 const r=assessManualAiPilotPreflight(e);
 assert.equal(r.allowed,false);
 assert.equal(r.blockers.length,4);
});
