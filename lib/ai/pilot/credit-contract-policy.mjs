/**
 * Offline acceptance specification for PR #42's idempotent-credit contract.
 *
 * This pure function DOES NOT enforce database security, authorize requests,
 * modify ledger records, or protect production. Actual protection must be
 * enforced atomically in the Supabase reservation RPC.
 */
export function assessExistingCreditReservation(existing, request) {
  if(!existing || !request ||
     typeof existing!=="object" || typeof request!=="object"){
    return {reusable:false,reason:"MISSING_BINDING"};
  }
  const required=["userId","operationKey","subscriptionId","executionId","requestId","idempotencyKey"];
  for(const key of required){
    if(typeof request[key]!=="string" || request[key].length===0 ||
       typeof existing[key]!=="string" || existing[key].length===0){
      return {reusable:false,reason:"INCOMPLETE_BINDING"};
    }
    if(existing[key]!==request[key]){
      return {reusable:false,reason:"MISMATCH_"+key.replace(/[A-Z]/g,x=>"_"+x.toLowerCase()).toUpperCase()};
    }
  }
  if(existing.status!=="reserved"){
    return {reusable:false,reason:"NOT_RESERVED"};
  }
  if(existing.runtimeClaimedAt!==null && existing.runtimeClaimedAt!==undefined){
    return {reusable:false,reason:"ALREADY_CLAIMED"};
  }
  return {reusable:true,reason:"EXACT_UNCLAIMED_MATCH"};
}
