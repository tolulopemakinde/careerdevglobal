/**
 * Evaluation-only release checklist. NOT a runtime authorization mechanism.
 *
 * The checker reports missing independently verified evidence; it cannot
 * attest the truth of a supplied evidence reference or replace integration QA.
 */
export const GATE_KEYS=Object.freeze([
  "isolatedEnvironment",
  "testRuntimeAndCreditContract",
  "subscriptionAndAuthorization",
  "retryIdempotency",
  "spendCapsAndKeys",
  "modelCataloguePreflight",
  "structuredOutputAndToolEquivalence",
  "sourceGroundingAndResearchFreshness",
  "humanReviewAndObservability",
  "liveSyntheticComparison",
  "rollbackAndOwnerApproval",
]);
const ID_RE=/^[a-z0-9][a-z0-9._/-]{7,180}$/i;

export function evaluateAiPilotReleaseReadiness(evidence) {
  const reasons=[];
  if(!evidence || evidence.version!==1 ||
     evidence.productionProjectRef!=="ufmhrmzumqkjvaezrmxf" ||
     evidence.testProjectRef!=="yyevuwvtrktrzwuzeddo" ||
     evidence.productionProjectRef===evidence.testProjectRef){
    reasons.push({gate:"environmentIdentity",reason:"PRODUCTION_TEST_BOUNDARY_UNVERIFIED"});
  }
  const gates=evidence?.gates;
  for(const gate of GATE_KEYS){
    const entry=gates && Object.prototype.hasOwnProperty.call(gates,gate)?gates[gate]:null;
    if(!entry || entry.passed!==true){
      reasons.push({gate,reason:"REQUIRED_EVIDENCE_NOT_VERIFIED"});
    }else if(!Array.isArray(entry.evidenceIds)||!entry.evidenceIds.length||
             entry.evidenceIds.some(id=>typeof id!=="string"||!ID_RE.test(id))){
      reasons.push({gate,reason:"VERIFIABLE_EVIDENCE_REFERENCE_REQUIRED"});
    }
  }
  if(evidence?.directProductionRoutingEnabled===true){
    reasons.push({gate:"productionRouting",reason:"PRODUCTION_ROUTING_MUST_REMAIN_DISABLED"});
  }
  return {ready:reasons.length===0,gatesChecked:GATE_KEYS.length,
    blockers:reasons,decision:reasons.length===0?"ELIGIBLE_FOR_HUMAN_REVIEW":"HOLD"};
}
