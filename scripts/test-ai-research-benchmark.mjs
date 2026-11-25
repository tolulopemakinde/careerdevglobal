import test from "node:test";
import assert from "node:assert/strict";
import {CAREER_RESEARCH_CASE_IDS,evaluateCareerResearchProviders} from "../lib/ai/pilot/research-benchmark.mjs";

const makeRun=(caseId,provider,extra={})=>({
  caseId,provider,liveCallVerified:true,synthetic:false,humanReviewed:true,
  reviewEvidenceUrl:"https://example.com/audit/signed-review",
  retrievedAt:"2026-11-04T09:00:00.000Z",costUsd:0.02,latencyMs:800,
  reviewedSources:[{url:"https://example.org/official-careers",independentlyVerified:true,
    reviewEvidenceUrl:"https://example.com/audit/source"}],
  scores:{provenance:25,freshness:25,relevance:20,resultQuality:15,costLatency:15},...extra,
});
const paired=()=>CAREER_RESEARCH_CASE_IDS.flatMap(id=>["exa","tavily"].map(p=>makeRun(id,p)));
test("missing benchmark results never auto-select Exa or Tavily",()=>{
  const x=evaluateCareerResearchProviders([]);
  assert.equal(x.status,"EVIDENCE_PENDING");
  assert.equal(x.productionAuthorized,false);
  assert.equal(x.scores,null);
  assert.equal(x.blockers.filter(v=>v.reason==="MATCHED_CASE_NOT_RUN").length,16);
});
test("synthetic measurements cannot establish a winner",()=>{
  const x=evaluateCareerResearchProviders(paired().map(v=>({...v,synthetic:true,liveCallVerified:false})));
  assert.equal(x.status,"EVIDENCE_PENDING");
  assert.equal(x.scores,null);
  assert.ok(x.blockers.some(v=>v.reason==="LIVE_HUMAN_REVIEW_MISSING"));
});
test("unverified sources and missing reviewer evidence block comparison",()=>{
  const arr=paired();
  arr[0]=makeRun(arr[0].caseId,arr[0].provider,{reviewedSources:[{url:"https://example.org",independentlyVerified:false,reviewEvidenceUrl:"https://example.com/audit/source"}]});
  arr[1]=makeRun(arr[1].caseId,arr[1].provider,{reviewEvidenceUrl:""});
  const x=evaluateCareerResearchProviders(arr);
  assert.equal(x.status,"EVIDENCE_PENDING");
  assert.ok(x.blockers.some(v=>v.reason==="SOURCE_PROVENANCE_NOT_VERIFIED"));
  assert.ok(x.blockers.some(v=>v.reason==="AUDIT_REFERENCE_MISSING"));
});
test("cost and latency require real numerical measurements",()=>{
  const arr=paired();
  arr[0]={...arr[0],costUsd:undefined};
  arr[1]={...arr[1],latencyMs:-1};
  const x=evaluateCareerResearchProviders(arr);
  assert.ok(x.blockers.some(v=>v.reason==="COST_NOT_MEASURED"));
  assert.ok(x.blockers.some(v=>v.reason==="LATENCY_NOT_MEASURED"));
});
test("unbounded or guessed human scores are rejected",()=>{
  const arr=paired();
  arr[0]={...arr[0],scores:{provenance:26,freshness:25,relevance:20,resultQuality:15,costLatency:15}};
  assert.ok(evaluateCareerResearchProviders(arr).blockers.some(v=>v.reason==="HUMAN_QUALITY_SCORES_MISSING"));
});
test("duplicate or unsupported provider result never counted twice",()=>{
  const d=paired();
  const a=evaluateCareerResearchProviders([...d,d[0]]);
  assert.ok(a.blockers.some(v=>v.reason==="DUPLICATE_MEASUREMENT"));
  const b=evaluateCareerResearchProviders([...d,{...d[0],provider:"unknown"}]);
  assert.ok(b.blockers.some(v=>v.reason==="UNRECOGNIZED_CASE_OR_PROVIDER"));
});
test("fully reviewed, independently sourced pairs are eligible for human choice only",()=>{
  const x=evaluateCareerResearchProviders(paired());
  assert.equal(x.status,"READY_FOR_HUMAN_SELECTION");
  assert.equal(x.productionAuthorized,false);
  assert.equal(x.scores.exa.cases,8);
  assert.equal(x.scores.tavily.averageHumanScore,100);
  assert.equal(x.scores.exa.totalMeasuredCostUsd,0.16);
});
test("provider performance cannot bypass review/production gates",()=>{
  const a=paired();
  const more=a.map(x=>x.provider==="tavily"?{...x,scores:{provenance:20,freshness:18,relevance:16,resultQuality:10,costLatency:10}}:x);
  const r=evaluateCareerResearchProviders(more);
  assert.equal(r.productionAuthorized,false);
  assert.equal(r.status,"READY_FOR_HUMAN_SELECTION");
  assert.ok(r.scores.exa.averageHumanScore>r.scores.tavily.averageHumanScore);
});
