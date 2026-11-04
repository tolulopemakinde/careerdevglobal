/**
 * Manual, read-only provider-model listing; never used by CI or deployed routes.
 *
 * Required operator-verified, separate pilot-only configuration:
 *   CAREERDEV_AI_MODEL_PREFLIGHT=true
 *   CAREERDEV_ISOLATED_TEST_PROJECT_REF=yyevuwvtrktrzwuzeddo
 *   CAREERDEV_PILOT_OWNER_APPROVED=true
 *   CAREERDEV_PILOT_BUDGET_CAP_VERIFIED=true
 *   OPENAI_PILOT_API_KEY=<approved, isolated pilot credential>
 *   GROQ_PILOT_API_KEY=<approved, isolated pilot credential>
 *   OPENAI_PILOT_MODEL=<approved model ID>
 *   GROQ_PILOT_MODEL=openai/gpt-oss-120b
 *
 * Credentials must be managed through an approved local secret manager,
 * never in GitHub commits, issues, screenshots, or chat messages.
 * The flags attest operator review; they do not independently establish it.
 */
import {checkPilotModelCatalogue} from "../lib/ai/pilot/model-connectivity.mjs";
import {assessManualAiPilotPreflight} from "../lib/ai/pilot/manual-preflight-policy.mjs";

const readiness=assessManualAiPilotPreflight(process.env,"catalogue");
if(!readiness.allowed){
  // The preflight is intentionally offline until ALL gates are satisfied.
  // Print stable reason codes only, never credentials, prompts, or account IDs.
  console.log(JSON.stringify({status:"HOLD",stage:"catalogue",
    blockers:readiness.blockers,requestsSent:0,productionAuthorized:false}));
  process.exitCode=2;
}else{
  const ref=process.env.CAREERDEV_ISOLATED_TEST_PROJECT_REF;
  const configs=[
    {provider:"openai",pilotKey:process.env.OPENAI_PILOT_API_KEY,
      approvedModel:process.env.OPENAI_PILOT_MODEL},
    {provider:"groq",pilotKey:process.env.GROQ_PILOT_API_KEY,
      approvedModel:process.env.GROQ_PILOT_MODEL},
  ];
  let failed=false;
  for(const c of configs){
    try{
      const outcome=await checkPilotModelCatalogue({...c,enabled:true,
        synthetic:true,isolatedProjectRef:ref});
      console.log(JSON.stringify({provider:outcome.provider,
        connected:outcome.connected,approvedModelFound:outcome.approvedModelFound,
        httpStatus:outcome.httpStatus,productionAuthorized:false}));
      if(!outcome.connected || !outcome.approvedModelFound)failed=true;
    }catch(error){
      console.log(JSON.stringify({provider:c.provider,status:"blocked",
        reason:error?.code||"PREFLIGHT_REQUEST_FAILED",productionAuthorized:false}));
      failed=true;
    }
  }
  if(failed)process.exitCode=1;
}
