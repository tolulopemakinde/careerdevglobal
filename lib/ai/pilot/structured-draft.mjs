/**
 * Isolated synthetic structured-output validator.
 * Used only for comparative evaluation. Not an agent entitlement, credit,
 * employment verification, authorization or human-approval mechanism.
 */
const KEYS=["summary","recommendations","source_refs","verification_gate","human_review_required"];
const HTTP_URL_PATTERN=/^https:\/\//i;
export class SyntheticDraftError extends Error {
  constructor(code){super(code);this.name="SyntheticDraftError";this.code=code;}
}
export function validateSyntheticCareerDraft(rawText, groundedSources) {
  if(typeof rawText!=="string" || rawText.length<2 || rawText.length>8000){
    throw new SyntheticDraftError("INVALID_MODEL_RESPONSE_SIZE");
  }
  if(!Array.isArray(groundedSources) || groundedSources.length<1 || groundedSources.length>5 ||
     groundedSources.some(s=>!s || typeof s.url!=="string" || !HTTP_URL_PATTERN.test(s.url) ||
       s.verifiedOpen!==false || s.retrievedAt===undefined)){
    throw new SyntheticDraftError("UNREVIEWED_RESEARCH_SOURCES");
  }
  let draft;
  try{draft=JSON.parse(rawText);}catch{throw new SyntheticDraftError("MODEL_JSON_PARSE_FAILED");}
  if(!draft || typeof draft!=="object" || Array.isArray(draft) ||
     Object.keys(draft).length!==KEYS.length || KEYS.some(k=>!(k in draft))){
    throw new SyntheticDraftError("MODEL_SCHEMA_MISMATCH");
  }
  if(typeof draft.summary!=="string" || !draft.summary.trim() || draft.summary.length>1200 ||
    !Array.isArray(draft.recommendations) || draft.recommendations.length<1 ||
    draft.recommendations.length>5 ||
    draft.recommendations.some(x=>typeof x!=="string"||!x.trim()||x.length>500)){
    throw new SyntheticDraftError("MODEL_SCHEMA_MISMATCH");
  }
  if(draft.verification_gate!==false || draft.human_review_required!==true) {
    // An AI response must not claim verification or human approval.
    throw new SyntheticDraftError("FORGED_VERIFICATION_OR_REVIEW");
  }
  const allowed=new Set(groundedSources.map(s=>s.url));
  if(!Array.isArray(draft.source_refs) || draft.source_refs.length<1 ||
     draft.source_refs.length>5 || draft.source_refs.some(s=>typeof s!=="string" || !allowed.has(s)) ||
     new Set(draft.source_refs).size!==draft.source_refs.length){
    throw new SyntheticDraftError("UNSUPPORTED_SOURCE_REFERENCE");
  }
  return {summary:draft.summary.trim(),recommendations:draft.recommendations.map(s=>s.trim()),
    source_refs:[...draft.source_refs],verification_gate:false,
    human_review_required:true,synthetic:true,productionAuthorized:false};
}
