// Provider API responses only. Webhook fields and browser input cannot prove a reversal.
function id(value: unknown): string {
 if(typeof value==='number'&&!Number.isSafeInteger(value))throw Error('Unsafe provider identity');
 if(!['string','number'].includes(typeof value)||!String(value).trim())throw Error('Missing provider identity');
 return String(value);
}
export function normalizePaymentAdjustment(payment:any,provider:any,kind:'refund'|'dispute',objectId:string,mode:'test'|'live'){
 if(id(provider.id)!==objectId||provider.domain!==mode)throw Error('Provider identity or mode mismatch');
 const tx=typeof provider.transaction==='object'?provider.transaction?.id:provider.transaction;
 if(id(tx)!==payment.provider_transaction_id)throw Error('Payment mismatch');
 if((provider.currency!=null&&provider.currency!==payment.currency)||(provider.transaction?.currency!=null&&provider.transaction.currency!==payment.currency)||(!provider.currency&&!provider.transaction?.currency))throw Error('Currency mismatch');
 if(provider.transaction?.domain!=null&&provider.transaction.domain!==mode)throw Error('Transaction mode mismatch');
 let action:string,amount:number;
 if(kind==='refund'){
  amount=Number(provider.amount);
  if(provider.status!=='processed'||!Number.isSafeInteger(amount)||amount<=0||amount>Number(payment.amount_minor))throw Error('Processed refund amount required');
  action='refund';
 }else{
  amount=Number(payment.amount_minor);
  if(['pending','awaiting-merchant-feedback','awaiting-bank-feedback'].includes(provider.status))action='dispute_open';
  else if(provider.status==='resolved'&&provider.resolution==='merchant-accepted')action='dispute_lost';
  // "declined" records a merchant response, not proof of a final bank award.
  else throw Error('Dispute outcome requires administrator review');
 }
 return {reference:payment.reference,transaction_id:payment.provider_transaction_id,currency:payment.currency,action,amount_minor:amount,provider_object_id:kind+':'+objectId,verification_source:'provider_api'};
}
