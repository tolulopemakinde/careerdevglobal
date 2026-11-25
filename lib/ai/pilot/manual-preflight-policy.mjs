/**
 * Explicit, offline stage gate for a manually operated AI pilot.
 *
 * NOTE: Boolean attestations are OPERATOR CLAIMS, not proof of account
 * isolation or provider-side billing controls. Require independently reviewed
 * evidence before setting them. This module performs NO network operations,
 * reads NO secret values into its output, and NEVER authorizes production.
 */
export const ISOLATED_AI_PROJECT="yyevuwvtrktrzwuzeddo";
const APPROVED_GROQ_MODEL_IDS=new Set(["openai/gpt-oss-120b","openai/gpt-oss-20b"]);
const MODEL_RE=/^[A-Za-z0-9][A-Za-z0-9/_:.-]{2,119}$/;
const KEY_MIN_LENGTH=8;

export function assessManualAiPilotPreflight(env,stage="catalogue"){
  const blocked=[];
  const e=env && typeof env==="object"?env:{};
  const failed=(cond,code)=>{if(cond)blocked.push(code);};
  failed(!["catalogue","inference"].includes(stage),"UNSUPPORTED_PREFLIGHT_STAGE");
  failed(e.CAREERDEV_AI_MODEL_PREFLIGHT!=="true","EXPLICIT_OPT_IN_MISSING");
  failed(e.CAREERDEV_ISOLATED_TEST_PROJECT_REF!==ISOLATED_AI_PROJECT,"ISOLATED_PROJECT_NOT_SELECTED");
  failed(e.NODE_ENV==="production" || e.CI==="true" || e.VERCEL==="1","AUTOMATED_OR_PRODUCTION_ENVIRONMENT_BLOCKED");
  failed(e.CAREERDEV_PILOT_OWNER_APPROVED!=="true","OWNER_APPROVAL_NOT_ATTESTED");
  failed(e.CAREERDEV_PILOT_BUDGET_CAP_VERIFIED!=="true","PROVIDER_SPENDING_LIMIT_NOT_ATTESTED");
  // Distinguish enforceable budget stops from alerts or rate limits.
  // OpenAI limits must have 'Enforce a hard limit' ON, not alert-only.
  // Groq's paid-tier monthly limit covers the WHOLE organization rather
  // than one key/project, and spend tracking can lag 10-15 minutes.
  // Avoid accidentally cutting off a production workload in that org.
  failed(e.CAREERDEV_OPENAI_ENFORCED_HARD_LIMIT_VERIFIED!=="true",
    "OPENAI_HARD_SPEND_LIMIT_NOT_ATTESTED");
  failed(e.CAREERDEV_GROQ_ORG_SPEND_LIMIT_VERIFIED!=="true",
    "GROQ_ORG_SPEND_LIMIT_NOT_ATTESTED");
  failed(e.CAREERDEV_GROQ_PILOT_PROJECT_ISOLATED!=="true",
    "GROQ_PILOT_PROJECT_NOT_ISOLATED");
  failed(e.CAREERDEV_GROQ_PILOT_ORG_SEPARATE_FROM_PRODUCTION!=="true",
    "GROQ_SPEND_LIMIT_COULD_AFFECT_PRODUCTION");

  // An ordinary model listing never accesses Supabase users or billing rows.
  // Paid inference additionally requires verified test data and payment isolation.
  if(stage==="inference"){
    failed(e.CAREERDEV_TEST_ACCOUNTS_PROVENANCE_VERIFIED!=="true","SYNTHETIC_TEST_ACCOUNTS_UNVERIFIED");
    failed(e.CAREERDEV_TEST_PAYMENT_ISOLATION_VERIFIED!=="true","TEST_PAYMENT_ENVIRONMENT_UNVERIFIED");
  }
  const oa=e.OPENAI_PILOT_API_KEY,gr=e.GROQ_PILOT_API_KEY;
  const keyOk=v=>typeof v==="string" && v.trim().length>=KEY_MIN_LENGTH;
  failed(!keyOk(oa),"DEDICATED_OPENAI_PILOT_KEY_MISSING");
  failed(!keyOk(gr),"DEDICATED_GROQ_PILOT_KEY_MISSING");
  if(keyOk(oa)&&keyOk(gr)){
    failed(oa===gr,"PILOT_PROVIDER_KEYS_NOT_SEPARATE");
  }
  if(keyOk(oa)){
    failed((typeof e.OPENAI_API_KEY==="string" && oa===e.OPENAI_API_KEY) ||
      (typeof e.GROQ_API_KEY==="string" && oa===e.GROQ_API_KEY),
    "OPENAI_PILOT_KEY_MATCHES_GENERIC_KEY");
  }
  if(keyOk(gr)){
    failed((typeof e.GROQ_API_KEY==="string" && gr===e.GROQ_API_KEY) ||
      (typeof e.OPENAI_API_KEY==="string" && gr===e.OPENAI_API_KEY),
    "GROQ_PILOT_KEY_MATCHES_GENERIC_KEY");
  }
  failed(typeof e.OPENAI_PILOT_MODEL!=="string" || !MODEL_RE.test(e.OPENAI_PILOT_MODEL),
    "OPENAI_MODEL_NOT_APPROVED");
  failed(!APPROVED_GROQ_MODEL_IDS.has(e.GROQ_PILOT_MODEL),
    "GROQ_MODEL_NOT_APPROVED");
  // Return only stable reason codes: never include env values, user IDs or keys.
  return {stage,allowed:blocked.length===0,decision:blocked.length===0?"OPERATOR_PREFLIGHT_ELIGIBLE":"HOLD",
    productionAuthorized:false,blockers:blocked};
}
