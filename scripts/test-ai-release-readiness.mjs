import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {evaluateAiPilotReleaseReadiness,GATE_KEYS} from "../lib/ai/pilot/release-readiness.mjs";
const manifest=JSON.parse(readFileSync(new URL("../docs/architecture/ai-provider-release-evidence-2026-11-04.json",import.meta.url),"utf8"));
test("currently reviewed pilot remains HOLD and production routing disabled",()=>{
 const x=evaluateAiPilotReleaseReadiness(manifest);
 assert.equal(x.decision,"HOLD");
 assert.equal(x.ready,false);
 assert.equal(x.gatesChecked,11);
 assert.equal(x.blockers.length,11);
 assert.equal(manifest.directProductionRoutingEnabled,false);
});
test("test vs production identity cannot be swapped",()=>{
 const x=evaluateAiPilotReleaseReadiness({...manifest,testProjectRef:manifest.productionProjectRef});
 assert.ok(x.blockers.some(v=>v.gate==="environmentIdentity"));
});
test("missing gate entry fails closed",()=>{
 const c=structuredClone(manifest);
 delete c.gates.retryIdempotency;
 assert.ok(evaluateAiPilotReleaseReadiness(c).blockers.some(v=>v.gate==="retryIdempotency"));
});
test("human assertion without a verifiable reference does not pass",()=>{
 const c=structuredClone(manifest);
 c.gates.spendCapsAndKeys={passed:true,evidenceIds:[]};
 assert.ok(evaluateAiPilotReleaseReadiness(c).blockers.some(v=>v.gate==="spendCapsAndKeys"&&v.reason==="VERIFIABLE_EVIDENCE_REFERENCE_REQUIRED"));
});
test("release checklist is not production activation authorization",()=>{
 const c=structuredClone(manifest);
 for(const gate of GATE_KEYS)c.gates[gate]={passed:true,evidenceIds:["reviewer/validated-evidence-001"]};
 c.directProductionRoutingEnabled=true;
 const x=evaluateAiPilotReleaseReadiness(c);
 assert.equal(x.ready,false);
 assert.ok(x.blockers.some(v=>v.gate==="productionRouting"));
});
test("completed evidence only makes project eligible for review, never auto-deploy",()=>{
 const c=structuredClone(manifest);
 for(const gate of GATE_KEYS)c.gates[gate]={passed:true,evidenceIds:["reviewer/validated-evidence-001"]};
 const x=evaluateAiPilotReleaseReadiness(c);
 assert.equal(x.decision,"ELIGIBLE_FOR_HUMAN_REVIEW");
 assert.equal(x.ready,true);
});
test("invalid evidence identifiers cannot bypass gate",()=>{
 const c=structuredClone(manifest);
 c.gates.rollbackAndOwnerApproval={passed:true,evidenceIds:["x"]};
 assert.ok(evaluateAiPilotReleaseReadiness(c).blockers.some(v=>v.gate==="rollbackAndOwnerApproval"));
});
