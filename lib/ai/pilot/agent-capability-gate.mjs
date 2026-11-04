/**
 * Planning-only model capability gate. This does not authorize inference,
 * bypass AI credits or prove live Groq compatibility.
 *
 * Groq's Structured Outputs documentation says strict JSON output cannot be
 * combined with tool use or streaming in the same request. An existing agent
 * using web_search AND strict json_schema therefore cannot be silently
 * migrated to a single Groq call.
 */
const GROQ_STRICT_MODELS=new Set(["openai/gpt-oss-120b","openai/gpt-oss-20b"]);
export function assessGroqCareerTask(task) {
  const blockers=[];
  if(!task || task.modelId===undefined || typeof task.modelId!=="string" ||
      !GROQ_STRICT_MODELS.has(task.modelId))blockers.push("UNVERIFIED_GROQ_MODEL");
  if(task?.requiresStrictJson===true && task?.requiresStreaming===true)blockers.push("STRICT_STREAMING_NOT_EQUIVALENT");
  if(task?.requiresStrictJson===true && task?.inModelTools===true)blockers.push("STRICT_WITH_TOOLS_NOT_EQUIVALENT");
  if(task?.requiresCurrentSources===true) {
    if(task?.researchProvider!=="exa" && task?.researchProvider!=="tavily")blockers.push("RESEARCH_PROVIDER_NOT_SELECTED");
    if(task?.sourcesIndependentlyVerified!==true)blockers.push("FRESH_SOURCES_NOT_VERIFIED");
  }
  if(task?.humanReviewRequired===true && task?.reviewControlValidated!==true)blockers.push("HUMAN_REVIEW_NOT_VALIDATED");
  if(task?.creditContractValidated!==true)blockers.push("CREDIT_ACCOUNTING_NOT_VALIDATED");
  return {
    eligibleForIsolatedComparison:blockers.length===0,
    productionEnabled:false,
    blockers,
    strategy:task?.requiresCurrentSources===true
      ? "SEPARATE_VERIFIED_RESEARCH_THEN_STRUCTURED_GENERATION"
      : "DIRECT_SYNTHETIC_GENERATION",
  };
}
