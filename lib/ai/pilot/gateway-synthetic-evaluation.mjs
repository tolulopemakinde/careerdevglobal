/**
 * MANUAL-ONLY Gateway-funded synthetic career comparison.
 *
 * This module has no public API route, Supabase client, payment integration, or
 * production imports. It must not be used to route customer AI traffic.
 * Requires an AI Gateway KEY with its own verified budget (not BYOK).
 */
import {generateText} from "ai";

export const GATEWAY_SYNTHETIC_CASE=Object.freeze({
  id:"fictional-career-switch",
  prompt:"SYNTHETIC EVALUATION ONLY. A fictional graduate named Example Person has two years of retail customer service experience and wants to explore junior data analysis. Suggest three transferable skills and two realistic first learning steps. Do not claim to know current job openings, cite web sources or guarantee employment.",
});
export const GATEWAY_PILOT_TARGETS=Object.freeze([
  Object.freeze({label:"openai-gateway",model:"openai/gpt-5.4-mini",only:Object.freeze(["openai"])}),
  Object.freeze({label:"groq-gateway",model:"openai/gpt-oss-120b",only:Object.freeze(["groq"])}),
]);
export class GatewayPilotError extends Error {
  constructor(code){super(code);this.name="GatewayPilotError";this.code=code;}
}
const TEST_ENV="isolated-gateway-synthetic";
const REQUIRED_ATTESTATIONS=Object.freeze([
  "CAREERDEV_GATEWAY_OWNER_APPROVED",
  "CAREERDEV_GATEWAY_KEY_BUDGET_VERIFIED",
  "CAREERDEV_GATEWAY_FUNDS_VERIFIED",
  "CAREERDEV_GATEWAY_AUTOTOPUP_DISABLED",
  "CAREERDEV_GATEWAY_NO_BYOK_VERIFIED",
]);
const safeKey=key=>typeof key==="string" && key.trim().length>=20;

/** Operator attestations are NOT independent proof of budget configuration. */
export function assessGatewaySyntheticEligibility(env){
  const e=env&&typeof env==="object"?env:{};
  const blockers=[];
  if(e.CAREERDEV_GATEWAY_SYNTHETIC_EVAL!=="true")blockers.push("SYNTHETIC_EVALUATION_DISABLED");
  if(e.CAREERDEV_GATEWAY_ENVIRONMENT!==TEST_ENV)blockers.push("ISOLATED_GATEWAY_ENVIRONMENT_MISSING");
  if(e.NODE_ENV==="production" || e.CI==="true" || Boolean(e.VERCEL))blockers.push("RUNTIME_BLOCKED");
  if(!safeKey(e.AI_GATEWAY_API_KEY))blockers.push("ISOLATED_GATEWAY_API_KEY_MISSING");
  for(const attestation of REQUIRED_ATTESTATIONS)if(e[attestation]!=="true"){
    // Expose only variable names, not environment values or secrets.
    blockers.push(attestation+"_NOT_ATTESTED");
  }
  return {allowed:blockers.length===0,decision:blockers.length?"HOLD":"MANUAL_SYNTHETIC_ONLY",
    blockers,productionAuthorized:false};
}

/** Exactly two non-streaming SDK requests, sequential, no SDK retries or model fallbacks. */
export async function compareGatewaySyntheticModels({env,generate=generateText,clock=()=>Date.now()}={}){
  const eligibility=assessGatewaySyntheticEligibility(env);
  if(!eligibility.allowed)throw new GatewayPilotError("GATEWAY_PILOT_PREFLIGHT_HOLD");
  if(typeof generate!=="function" || typeof clock!=="function")throw new GatewayPilotError("INVALID_TEST_TRANSPORT");
  const results=[];
  // Same synthetic prompt for each provider to make human assessment meaningful.
  for(const target of GATEWAY_PILOT_TARGETS){
    const started=clock();
    let output;
    try{
      output=await generate({
        model:target.model,
        prompt:GATEWAY_SYNTHETIC_CASE.prompt,
        maxOutputTokens:160,
        maxRetries:0,
        abortSignal:AbortSignal.timeout(12000),
        providerOptions:{gateway:{only:[...target.only]}},
      });
    }catch{
      // Never print gateway errors: they can carry request identifiers or details.
      throw new GatewayPilotError("GATEWAY_PROVIDER_ATTEMPT_FAILED");
    }
    if(!output || typeof output.text!=="string" ||
       output.text.trim().length===0 || output.text.length>1800){
      throw new GatewayPilotError("INVALID_SYNTHETIC_RESPONSE");
    }
    results.push({
      caseId:GATEWAY_SYNTHETIC_CASE.id,
      model:target.model,
      requiredProvider:target.only[0],
      output:output.text.trim(),
      durationMs:Math.max(0,Math.min(clock()-started,600000)),
      inputTokens:Number.isSafeInteger(output.usage?.inputTokens)?output.usage.inputTokens:null,
      outputTokens:Number.isSafeInteger(output.usage?.outputTokens)?output.usage.outputTokens:null,
      // Gateway can internally retry eligible endpoints; inspect its logs for
      // actual billable attempts. maxRetries:0 controls AI SDK retries only.
    });
  }
  return {status:"REQUIRES_HUMAN_REVIEW",synthetic:true,
    attemptsScheduled:GATEWAY_PILOT_TARGETS.length,results,
    productionAuthorized:false,
    caveat:"Outputs and latencies are illustrative; reconcile charges and actual providers in Gateway Logs. No customer entitlements were exercised."};
}
