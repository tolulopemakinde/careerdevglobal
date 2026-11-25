/**
 * Run only in a locally authorized shell after configuring a funded, key-
 * budgeted Vercel AI Gateway key. NEVER run in CI, Vercel, or production.
 *
 * Requires:
 *  CAREERDEV_GATEWAY_SYNTHETIC_EVAL=true
 *  CAREERDEV_GATEWAY_ENVIRONMENT=isolated-gateway-synthetic
 *  CAREERDEV_GATEWAY_OWNER_APPROVED=true
 *  CAREERDEV_GATEWAY_KEY_BUDGET_VERIFIED=true
 *  CAREERDEV_GATEWAY_FUNDS_VERIFIED=true
 *  CAREERDEV_GATEWAY_AUTOTOPUP_DISABLED=true
 *  CAREERDEV_GATEWAY_NO_BYOK_VERIFIED=true
 *  AI_GATEWAY_API_KEY (from a secure credential store; never commit or paste)
 *
 * No production data, Supabase accounts, customer credits or web-search tools.
 */
import {
  assessGatewaySyntheticEligibility,
  compareGatewaySyntheticModels,
} from "../lib/ai/pilot/gateway-synthetic-evaluation.mjs";

const eligibility=assessGatewaySyntheticEligibility(process.env);
if(!eligibility.allowed){
  console.log(JSON.stringify({status:"HOLD",blockers:eligibility.blockers,
    scheduledRequests:0,productionAuthorized:false}));
  process.exitCode=2;
}else{
  try{
    // Exactly two sequential, synthetic, plain-text requests. No automatic
    // model fallback and no AI SDK retries. Gateway itself may retry serving
    // endpoints, so observe actual attempts and cost in Gateway Logs.
    const r=await compareGatewaySyntheticModels({env:process.env});
    console.log(JSON.stringify(r,null,2));
  }catch(e){
    // No raw provider errors or request/secret-bearing stack traces.
    console.log(JSON.stringify({status:"HOLD",
      reason:e?.code||"GATEWAY_SYNTHETIC_EVALUATION_FAILED",
      productionAuthorized:false}));
    process.exitCode=1;
  }
}
