import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {inspectAiPilotReleaseLedger,readAiPilotReleaseLedger,ACTIONS} from "../scripts/report-ai-pilot-readiness.mjs";
import {GATE_KEYS} from "../lib/ai/pilot/release-readiness.mjs";
test("release report flags exactly the outstanding gated evidence from current ledger",()=>{
  const r=inspectAiPilotReleaseLedger(readAiPilotReleaseLedger());
  assert.equal(r.decision,"HOLD");
  assert.equal(r.checkedGates,11);
  assert.equal(r.outstandingGates,11);
  assert.equal(r.providerRequestsSent,0);
  assert.equal(r.productionAuthorized,false);
  assert.equal(r.gates.length,11);
  assert.deepEqual(r.gates.map(x=>x.gate),[...GATE_KEYS]);
});
test("every recognized gate has one actionable manual acceptance task",()=>{
  assert.deepEqual(Object.keys(ACTIONS),[...GATE_KEYS]);
  for(const k of GATE_KEYS){
    assert.equal(typeof ACTIONS[k],"string");
    assert.ok(ACTIONS[k].length>20);
  }
});
test("environment and production-routing identity concerns are reported separately",()=>{
  const data=structuredClone(readAiPilotReleaseLedger());
  data.productionProjectRef=data.testProjectRef;
  data.directProductionRoutingEnabled=true;
  const r=inspectAiPilotReleaseLedger(data);
  assert.equal(r.decision,"HOLD");
  assert.ok(r.otherBlockers.some(b=>b.gate==="environmentIdentity"));
  assert.ok(r.otherBlockers.some(b=>b.gate==="productionRouting"));
});
test("complete-but-unverified references still require independent human approval",()=>{
  const data=structuredClone(readAiPilotReleaseLedger());
  for(const name of GATE_KEYS){
    data.gates[name]={passed:true,evidenceIds:["reviewed/manually-submitted-evidence"]};
  }
  const r=inspectAiPilotReleaseLedger(data);
  assert.equal(r.decision,"EVIDENCE_REFERENCES_COMPLETE_HUMAN_REVIEW_REQUIRED");
  assert.equal(r.productionAuthorized,false);
  assert.equal(r.outstandingGates,0);
});
test("CLI emits stable status without network access, credentials or private account data",()=>{
  const p=spawnSync(process.execPath,[new URL("../scripts/report-ai-pilot-readiness.mjs",import.meta.url).pathname],{
    encoding:"utf8",env:{...process.env,OPENAI_API_KEY:"must-not-appear-openai",GROQ_API_KEY:"must-not-appear-groq"},timeout:5000,
  });
  assert.equal(p.status,0);
  const r=JSON.parse(p.stdout);
  assert.equal(r.decision,"HOLD");
  assert.equal(r.productionAuthorized,false);
  assert.equal(r.providerRequestsSent,0);
  assert.ok(!p.stdout.includes("must-not-appear"));
});
