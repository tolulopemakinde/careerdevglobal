/**
 * Offline-only, auditable AI pilot release status report.
 *
 * This script never reads API keys, runs provider requests, accesses databases,
 * enables feature flags, or modifies production. Evidence IDs in the ledger are
 * references supplied by reviewers, NOT automatically authenticated proof.
 */
import {readFileSync} from "node:fs";
import {evaluateAiPilotReleaseReadiness,GATE_KEYS} from "../lib/ai/pilot/release-readiness.mjs";

const EVIDENCE_PATH=new URL("../docs/architecture/ai-provider-release-evidence-2026-11-04.json",import.meta.url);
export const ACTIONS=Object.freeze({
  isolatedEnvironment:"Owner-verify test accounts and independent payment/provider isolation",
  testRuntimeAndCreditContract:"Reconcile production and TEST credit lifecycle, then run DB-backed acceptance",
  subscriptionAndAuthorization:"Verify authenticated ownership, subscription and agent authorization",
  retryIdempotency:"Prove one reservation and exactly one confirmed settlement across live fallback",
  spendCapsAndKeys:"Verify separate pilot API keys, enforced provider limits, Groq organization isolation",
  modelCataloguePreflight:"Run manually approved catalogue-only GET with separate capped credentials",
  structuredOutputAndToolEquivalence:"Verify schema validation, research/tool parity and safe rejection",
  sourceGroundingAndResearchFreshness:"Run human-reviewed Exa/Tavily matched source-grounding benchmark",
  humanReviewAndObservability:"Verify coach-review boundaries and sanitized audit observability",
  liveSyntheticComparison:"Collect real synthetic request latency, cost and bounded retry evidence",
  rollbackAndOwnerApproval:"Rehearse rollback and obtain explicit owner release approval",
});
export function inspectAiPilotReleaseLedger(evidence){
  const status=evaluateAiPilotReleaseReadiness(evidence);
  const outstanding=GATE_KEYS.filter(g=>status.blockers.some(b=>b.gate===g));
  return {
    decision:status.ready?"EVIDENCE_REFERENCES_COMPLETE_HUMAN_REVIEW_REQUIRED":"HOLD",
    checkedGates:GATE_KEYS.length,
    outstandingGates:outstanding.length,
    gates:outstanding.map(g=>({gate:g,nextAction:ACTIONS[g]})),
    otherBlockers:status.blockers.filter(b=>!GATE_KEYS.includes(b.gate)),
    productionAuthorized:false,
    providerRequestsSent:0,
    caveat:"References are NOT independent verification. Owner review, billing acceptance and release approval remain required.",
  };
}
export function readAiPilotReleaseLedger(){
  const text=readFileSync(EVIDENCE_PATH,"utf8");
  if(text.length>100_000)throw new Error("RELEASE_EVIDENCE_FILE_TOO_LARGE");
  return JSON.parse(text);
}
if(process.argv[1] && import.meta.url===new URL("file://"+process.argv[1]).href){
  try{
    console.log(JSON.stringify(inspectAiPilotReleaseLedger(readAiPilotReleaseLedger()),null,2));
  }catch{
    console.log(JSON.stringify({decision:"HOLD",reason:"RELEASE_EVIDENCE_INVALID",
      productionAuthorized:false,providerRequestsSent:0}));
    process.exitCode=1;
  }
}
