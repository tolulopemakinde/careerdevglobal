/**
 * OFFLINE ONLY — contract simulation for PR #42's test-side
 * reserve_ai_credits -> claim_ai_runtime_credit -> settle_ai_credit_charge.
 *
 * This is NOT database billing code, an API route, a customer entitlement check,
 * or permission to run actual paid provider calls.
 *
 * Dedicated production provider routing would require authoritative server-side
 * RPC authorization, immutable idempotency, ownership verification, transaction
 * recovery, and a separately reviewed deployment.
 */
export class SyntheticCreditSimulationError extends Error {
  constructor(code) {super(code); this.name="SyntheticCreditSimulationError";this.code=code;}
}
const TEST_PROJECT="yyevuwvtrktrzwuzeddo";

function validKey(key){
  return typeof key==="string" && /^[a-zA-Z0-9_-]{8,80}$/.test(key);
}

/**
 * @param {{
 *  enabled:boolean,synthetic:boolean,environment:"isolated-test",
 *  projectRef:string,requestKey:string,
 *  creditPort:{
 *    reserve:(key:string)=>Promise<{allowed:boolean,ledgerId?:string}>,
 *    claim:(ledgerId:string,key:string)=>Promise<boolean>,
 *    settle:(ledgerId:string,outcome:"consumed"|"released",key:string)=>Promise<{status:"consumed"|"released",duplicate:boolean}>
 *    // Model the sandbox settle_ai_credit_charge JSON response, not a boolean.
 *  },
 *  invoke:()=>Promise<{provider:"openai"|"groq",text:string}>,
 *  validate:(result:object)=>Promise<boolean>,
 *  persist:(result:object)=>Promise<boolean>,
 * }} config
 */
export async function runSyntheticCreditHandoff(config){
  if(process.env.NODE_ENV==="production")
    throw new SyntheticCreditSimulationError("PRODUCTION_RUNTIME_BLOCKED");
  if(!config || config.enabled!==true || config.synthetic!==true ||
     config.environment!=="isolated-test" || config.projectRef!==TEST_PROJECT)
    throw new SyntheticCreditSimulationError("SYNTHETIC_BILLING_DISABLED");
  if(!validKey(config.requestKey))
    throw new SyntheticCreditSimulationError("INVALID_REQUEST_KEY");
  if(!config.creditPort || !["reserve","claim","settle"].every(k=>
       typeof config.creditPort[k]==="function") ||
     !["invoke","validate","persist"].every(k=>typeof config[k]==="function"))
    throw new SyntheticCreditSimulationError("MISSING_SIMULATION_PORT");

  const key=config.requestKey;
  // Reserve only once for the entire logical request, regardless of providers.
  let reservation;
  try{reservation=await config.creditPort.reserve(key);}
  catch{throw new SyntheticCreditSimulationError("CREDIT_RESERVATION_UNCONFIRMED");}
  if(!reservation?.allowed)
    throw new SyntheticCreditSimulationError("CREDIT_RESERVATION_DENIED");
  if(typeof reservation.ledgerId!=="string" || !validKey(reservation.ledgerId))
    throw new SyntheticCreditSimulationError("INVALID_CREDIT_LEDGER");

  const ledger=reservation.ledgerId;
  // Only the claiming invocation may settle this reservation. A failed claim
  // could indicate another invocation has ownership: do not release its ledger.
  let claimed=false;
  try{claimed=await config.creditPort.claim(ledger,key)===true;}
  catch{throw new SyntheticCreditSimulationError("CREDIT_CLAIM_UNCONFIRMED");}
  if(!claimed)throw new SyntheticCreditSimulationError("CREDIT_CLAIM_REJECTED");

  let settlementAttempted=false;
  const settle=async outcome=>{
    if(settlementAttempted)
      throw new SyntheticCreditSimulationError("CREDIT_SETTLEMENT_ALREADY_ATTEMPTED");
    settlementAttempted=true;
    let receipt=null;
    try{receipt=await config.creditPort.settle(ledger,outcome,key);}
    catch{/* Transport/RPC ambiguity: manual reconciliation, no retries. */}
    // The isolated sandbox RPC returns {status,duplicate}. A duplicate or
    // conflicting outcome needs human reconciliation, not a blind second charge.
    if(!receipt || typeof receipt!=="object" || receipt.status!==outcome ||
       receipt.duplicate!==false)
      throw new SyntheticCreditSimulationError("CREDIT_SETTLEMENT_UNCONFIRMED");
  };

  try{
    // Both primary and eligible secondary provider attempts are *inside*
    // this single claimed ledger, and must use SDK maxRetries:0.
    const result=await config.invoke();
    if(!result || !["openai","groq"].includes(result.provider) ||
       typeof result.text!=="string" || !result.text.trim())
      throw new SyntheticCreditSimulationError("INVALID_SYNTHETIC_PROVIDER_RESULT");
    if(await config.validate(result)!==true)
      throw new SyntheticCreditSimulationError("SYNTHETIC_OUTPUT_NOT_VALIDATED");
    if(await config.persist(result)!==true)
      throw new SyntheticCreditSimulationError("SYNTHETIC_OUTPUT_NOT_PERSISTED");
    await settle("consumed");
    return {status:"synthetic_completed",provider:result.provider,
      settlement:"consumed",requestKey:key,productionAuthorized:false};
  }catch(error){
    if(!settlementAttempted){
      // Provider, output-validation and persistence failure => release once.
      // Settlement errors are never treated as a new provider failure.
      await settle("released");
    }
    if(error instanceof SyntheticCreditSimulationError)throw error;
    throw new SyntheticCreditSimulationError("SYNTHETIC_EXECUTION_FAILED");
  }
}
