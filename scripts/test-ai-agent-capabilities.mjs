import test from "node:test";
import assert from "node:assert/strict";
import {assessGroqCareerTask} from "../lib/ai/pilot/agent-capability-gate.mjs";
const base=(changes={})=>({
  modelId:"openai/gpt-oss-120b",requiresStrictJson:true,
  requiresStreaming:false,inModelTools:false,requiresCurrentSources:false,
  sourcesIndependentlyVerified:false,creditContractValidated:false,
  humanReviewRequired:true,reviewControlValidated:false,...changes,
});
test("current Career Discovery path cannot automatically switch providers",()=>{
  const result=assessGroqCareerTask(base({requiresCurrentSources:true,inModelTools:true}));
  assert.equal(result.eligibleForIsolatedComparison,false);
  assert.equal(result.productionEnabled,false);
  assert.ok(result.blockers.includes("STRICT_WITH_TOOLS_NOT_EQUIVALENT"));
  assert.ok(result.blockers.includes("FRESH_SOURCES_NOT_VERIFIED"));
  assert.ok(result.blockers.includes("CREDIT_ACCOUNTING_NOT_VALIDATED"));
});
test("independent research with strict structured output requires source verification",()=>{
  const result=assessGroqCareerTask(base({
    requiresCurrentSources:true,researchProvider:"exa",inModelTools:false,
    creditContractValidated:true,reviewControlValidated:true,
  }));
  assert.equal(result.eligibleForIsolatedComparison,false);
  assert.ok(result.blockers.includes("FRESH_SOURCES_NOT_VERIFIED"));
});
test("reviewed two-stage design can be evaluated but does not authorize production",()=>{
  const result=assessGroqCareerTask(base({
    requiresCurrentSources:true,researchProvider:"tavily",sourcesIndependentlyVerified:true,
    inModelTools:false,creditContractValidated:true,reviewControlValidated:true,
  }));
  assert.equal(result.eligibleForIsolatedComparison,true);
  assert.equal(result.productionEnabled,false);
  assert.equal(result.strategy,"SEPARATE_VERIFIED_RESEARCH_THEN_STRUCTURED_GENERATION");
});
test("strict JSON with streaming is blocked",()=>{
  assert.ok(assessGroqCareerTask(base({requiresStreaming:true})).blockers.includes("STRICT_STREAMING_NOT_EQUIVALENT"));
});
test("unsupported model never silently fails over",()=>{
  assert.ok(assessGroqCareerTask(base({modelId:"unvalidated-model"})).blockers.includes("UNVERIFIED_GROQ_MODEL"));
});
test("human approval gate cannot be omitted for review-dependent task",()=>{
  assert.ok(assessGroqCareerTask(base({creditContractValidated:true})).blockers.includes("HUMAN_REVIEW_NOT_VALIDATED"));
});
