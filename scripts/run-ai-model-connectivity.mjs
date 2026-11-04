/**
 * Explicit, read-only model availability check.
 *
 * This script is NEVER run by CI or a deployed route. To opt in manually:
 *   CAREERDEV_AI_MODEL_PREFLIGHT=true
 *   CAREERDEV_ISOLATED_TEST_PROJECT_REF=yyevuwvtrktrzwuzeddo
 *   OPENAI_PILOT_API_KEY=<separate test-only key>
 *   GROQ_PILOT_API_KEY=<separate test-only key>
 *   OPENAI_PILOT_MODEL=<approved model ID>
 *   GROQ_PILOT_MODEL=<approved model ID>
 *   node scripts/run-ai-model-connectivity.mjs
 *
 * Never paste API keys into commits or issues.
 */
import {checkPilotModelCatalogue} from "../lib/ai/pilot/model-connectivity.mjs";

const ref=process.env.CAREERDEV_ISOLATED_TEST_PROJECT_REF;
const enabled=process.env.CAREERDEV_AI_MODEL_PREFLIGHT==="true";
if(!enabled || ref!=="yyevuwvtrktrzwuzeddo" || process.env.NODE_ENV==="production"){
  console.error("Preflight disabled: requires explicit isolated-test configuration.");
  process.exitCode=2;
}else{
  const configs=[
    {provider:"openai",pilotKey:process.env.OPENAI_PILOT_API_KEY,
     approvedModel:process.env.OPENAI_PILOT_MODEL},
    {provider:"groq",pilotKey:process.env.GROQ_PILOT_API_KEY,
     approvedModel:process.env.GROQ_PILOT_MODEL},
  ];
  const existing=[process.env.OPENAI_API_KEY,process.env.GROQ_API_KEY].filter(Boolean);
  if(configs.some(c=>!c.pilotKey || existing.includes(c.pilotKey))){
    console.error("Dedicated pilot credentials not configured or match generic credentials; no requests sent.");
    process.exitCode=2;
  }else{
    let failed=false;
    for(const c of configs){
      try{
        const outcome=await checkPilotModelCatalogue({...c,enabled:true,
          synthetic:true,isolatedProjectRef:ref});
        // Deliberately output only booleans, provider ID and HTTP status, never any key.
        console.log(JSON.stringify(outcome));
        if(!outcome.connected || !outcome.approvedModelFound)failed=true;
      }catch(error){
        console.log(JSON.stringify({provider:c.provider,status:"blocked",
          reason:error?.code||"UNEXPECTED_PREFLIGHT_FAILURE"}));
        failed=true;
      }
    }
    if(failed)process.exitCode=1;
  }
}
