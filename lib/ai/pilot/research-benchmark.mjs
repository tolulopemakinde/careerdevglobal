/**
 * Evidence-based comparison of Exa/Tavily for CareerDev Global.
 *
 * A benchmark is not valid unless BOTH providers have eight *real*
 * matched-query measurements and reviewer-verified source evidence.
 * Never select a provider from synthetic / guessed scores.
 * No network or user account action takes place in this module.
 */
export const CAREER_RESEARCH_CASE_IDS=Object.freeze([
  "ng-entry-data-analyst",
  "ng-hr-generalist",
  "global-remote-qa",
  "ng-pmi-credentials",
  "ng-cybersecurity-skills",
  "ng-graduate-trainee",
  "icf-coaching-credentials",
  "za-renewable-energy-graduates",
]);
const PROVIDERS=Object.freeze(["exa","tavily"]);
const RUBRIC=Object.freeze({
  provenance:25,
  freshness:25,
  relevance:20,
  resultQuality:15,
  costLatency:15,
});
const maxSum=Object.values(RUBRIC).reduce((a,b)=>a+b,0);

function validHttpsUrl(value){
  try{
    if(typeof value!=="string")return false;
    const u=new URL(value);
    return u.protocol==="https:" && !u.username && !u.password &&
      !/^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname) &&
      u.hostname.includes(".");
  }catch{return false;}
}
function validateMeasurement(x){
  if(!x || x.liveCallVerified!==true || x.synthetic!==false || x.humanReviewed!==true)
    return "LIVE_HUMAN_REVIEW_MISSING";
  if(typeof x.reviewEvidenceUrl!=="string" || !validHttpsUrl(x.reviewEvidenceUrl))
    return "AUDIT_REFERENCE_MISSING";
  if(typeof x.retrievedAt!=="string" || !Number.isFinite(Date.parse(x.retrievedAt)))
    return "RETRIEVAL_TIMESTAMP_MISSING";
  if(typeof x.costUsd!=="number" || !Number.isFinite(x.costUsd) || x.costUsd<0)
    return "COST_NOT_MEASURED";
  if(typeof x.latencyMs!=="number" || !Number.isFinite(x.latencyMs) || x.latencyMs<0)
    return "LATENCY_NOT_MEASURED";
  if(!Array.isArray(x.reviewedSources) || x.reviewedSources.length<1 || x.reviewedSources.length>5)
    return "REVIEWED_SOURCES_MISSING";
  for(const s of x.reviewedSources) {
    if(!validHttpsUrl(s?.url) || s.independentlyVerified!==true ||
       typeof s.reviewEvidenceUrl!=="string" || !validHttpsUrl(s.reviewEvidenceUrl))
      return "SOURCE_PROVENANCE_NOT_VERIFIED";
  }
  if(!x.scores || Object.keys(RUBRIC).some(k=>
    !Number.isInteger(x.scores[k]) || x.scores[k]<0 || x.scores[k]>RUBRIC[k]))
    return "HUMAN_QUALITY_SCORES_MISSING";
  return null;
}

/**
 * Pure, fail-closed audit of paired externally collected measurements.
 * 'READY_FOR_HUMAN_SELECTION' is not permission to activate a provider.
 */
export function evaluateCareerResearchProviders(measurements){
  const blockers=[], results={exa:[],tavily:[]}, seen=new Set();
  if(!Array.isArray(measurements)){return {status:"EVIDENCE_PENDING",blockers:[{reason:"MEASUREMENTS_REQUIRED"}],scores:null,productionAuthorized:false};}
  for(const [i,x] of measurements.entries()){
    if(!x || !CAREER_RESEARCH_CASE_IDS.includes(x.caseId)||!PROVIDERS.includes(x.provider)){
      blockers.push({index:i,reason:"UNRECOGNIZED_CASE_OR_PROVIDER"});continue;
    }
    const id=x.caseId+"|"+x.provider;
    if(seen.has(id)){blockers.push({caseId:x.caseId,provider:x.provider,reason:"DUPLICATE_MEASUREMENT"});continue;}
    seen.add(id);
    const error=validateMeasurement(x);
    if(error){blockers.push({caseId:x.caseId,provider:x.provider,reason:error});continue;}
    results[x.provider].push({caseId:x.caseId,score:Object.keys(RUBRIC).reduce((n,k)=>n+x.scores[k],0),
      costUsd:x.costUsd,latencyMs:x.latencyMs});
  }
  for(const caseId of CAREER_RESEARCH_CASE_IDS)for(const provider of PROVIDERS){
    if(!seen.has(caseId+"|"+provider))blockers.push({caseId,provider,reason:"MATCHED_CASE_NOT_RUN"});
  }
  if(blockers.length || results.exa.length!==8 || results.tavily.length!==8){
    return {status:"EVIDENCE_PENDING",blockers,scores:null,productionAuthorized:false};
  }
  const scores=Object.fromEntries(PROVIDERS.map(p=>[p,{
    averageHumanScore:results[p].reduce((n,r)=>n+r.score,0)/8,
    totalMeasuredCostUsd:results[p].reduce((n,r)=>n+r.costUsd,0),
    averageLatencyMs:results[p].reduce((n,r)=>n+r.latencyMs,0)/8,
    cases:8,possibleScore:maxSum,
  }]));
  return {status:"READY_FOR_HUMAN_SELECTION",blockers:[],scores,productionAuthorized:false};
}
