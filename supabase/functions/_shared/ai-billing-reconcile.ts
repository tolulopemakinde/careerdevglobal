import {verifySubscriptionPayment} from './ai-billing-provider.ts';
export function transactionReference(data:any){
 const references=[data?.transaction?.reference,data?.transaction_reference,data?.reference].filter(x=>x!=null&&String(x).trim()).map(x=>String(x).trim());
 if(new Set(references).size>1)throw new Error('Conflicting transaction references');
 return references[0]??'';
}
export async function exactSubscription(sb:any,reference:string,code:string){
 let byReference:any=null,byCode:any=null;
 if(reference){
  const r=await sb.from('ai_agent_subscriptions').select('*').eq('paystack_transaction_reference',reference).maybeSingle();
  if(r.error)throw new Error('Transaction correlation failed');byReference=r.data;
  if(!byReference){
   const payment=await sb.from('ai_subscription_payments').select('subscription_id').eq('reference',reference).maybeSingle();
   if(payment.error)throw new Error('Payment correlation failed');
   if(payment.data){const r=await sb.from('ai_agent_subscriptions').select('*').eq('id',payment.data.subscription_id).single();if(r.error)throw new Error('Payment subscription lookup failed');byReference=r.data}
  }
 }
 if(code){const r=await sb.from('ai_agent_subscriptions').select('*').eq('paystack_subscription_code',code).maybeSingle();if(r.error)throw new Error('Subscription correlation failed');byCode=r.data}
 if(byReference&&byCode&&byReference.id!==byCode.id)throw new Error('Conflicting subscription identifiers');
 if(byReference?.paystack_subscription_code&&code&&byReference.paystack_subscription_code!==code)throw new Error('Conflicting subscription identifiers');
 return byReference??byCode;
}
export async function applyRecordedEvent(sb:any,secret:string,event:any,operator?:{id:string;reason:string}){
 if(event.processing_status==='processed'){
  if(!operator)return {processed:true,duplicate:true};
  const audited=await sb.rpc('reconcile_ai_subscription_event',{p_event_id:event.id,p_actor_id:operator.id,p_reason:operator.reason});
  if(audited.error)throw new Error('Replay audit failed');return audited.data;
 }
 if(!['verified','failed','unmatched'].includes(event.processing_status))throw new Error('Event is not replayable');
 const data=event.payload?.data,reference=transactionReference(data),code=String(data?.subscription_code??data?.subscription?.subscription_code??'');
 const sub=await exactSubscription(sb,reference,code);
 if(!sub){
  const r=await sb.from('ai_agent_subscription_webhook_events').update({processing_status:'unmatched',error_message:'No exact subscription match'}).eq('id',event.id).neq('processing_status','processed');
  if(r.error)throw new Error('Unable to quarantine event');
  if(operator){
   const audited=await sb.rpc('reconcile_ai_subscription_event',{p_event_id:event.id,p_actor_id:operator.id,p_reason:operator.reason});
   if(audited.error)throw new Error('Replay audit failed');return audited.data;
  }
  return {processed:false,unmatched:true};
 }
 if(event.event_type==='charge.success'||(event.event_type==='invoice.update'&&['paid','success'].includes(data?.status))){
  let payment;
  try{payment=await verifySubscriptionPayment(secret,sub,reference,code)}catch(error){
   if(operator){
    const audit=await sb.from('ai_billing_reconciliation_audit').insert({event_id:event.id,actor_id:operator.id,reason:operator.reason,result:{processed:false,provider_verification_failed:true}});
    if(audit.error)throw new Error('Replay audit failed');
   }
   throw error;
  }
  const r=await sb.from('ai_agent_subscription_webhook_events').update({verified_payment:payment}).eq('id',event.id).neq('processing_status','processed');
  if(r.error)throw new Error('Verified payment could not be recorded');
 }
 const result=operator
  ?await sb.rpc('reconcile_ai_subscription_event',{p_event_id:event.id,p_actor_id:operator.id,p_reason:operator.reason})
  :await sb.rpc('apply_ai_subscription_webhook_state',{p_event_id:event.id});
 if(result.error)throw new Error('Transactional reconciliation failed');
 return result.data;
}
