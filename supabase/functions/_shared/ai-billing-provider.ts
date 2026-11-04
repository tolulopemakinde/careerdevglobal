// Provider responses stay on the server. Return only the normalized billing contract.
export async function paystackRequest(secret:string,path:string,body?:unknown){
  const response=await fetch('https://api.paystack.co'+path,{
    method:body===undefined?'GET':'POST',
    headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)
  });
  const result=await response.json();
  if(!response.ok||result?.status!==true){
    const message=String(result?.message??'').toLowerCase();
    const category=message.includes('email')?'email':message.includes('currency')?'currency':message.includes('plan')?'plan':message.includes('callback')?'callback':'request';
    throw new Error('provider_'+response.status+'_'+category);
  }
  return result.data;
}
export function providerPlanCode(value:any):string|null {
  return typeof value==='string'?value:value?.plan_code??null;
}
export function assertProviderSubscription(sub:any,provider:any){
  if(!provider?.subscription_code||provider.subscription_code!==sub.paystack_subscription_code)throw new Error('Provider subscription mismatch');
  if(!sub.paystack_customer_code||provider?.customer?.customer_code!==sub.paystack_customer_code)throw new Error('Provider customer mismatch');
  if(providerPlanCode(provider.plan)!==sub.paystack_plan_code)throw new Error('Provider plan mismatch');
  if(Number(provider.amount)!==Math.round(Number(sub.amount)*100)||provider.plan?.currency!==sub.currency)throw new Error('Provider price mismatch');
}
export function normalizeVerifiedPayment(sub:any,transaction:any,provider:any,reference:string,mode:string){
  if(transaction?.status!=='success'||transaction.reference!==reference||transaction.domain!==mode)throw new Error('Successful transaction verification required');
  if(!transaction.id||(typeof transaction.id==='number'&&!Number.isSafeInteger(transaction.id))||!Number.isSafeInteger(transaction.amount)||transaction.amount!==Math.round(Number(sub.amount)*100)||transaction.currency!==sub.currency)throw new Error('Payment amount or currency mismatch');
  const customer=transaction.customer?.customer_code;
  if(!customer||provider.customer?.customer_code!==customer||(sub.paystack_customer_code&&sub.paystack_customer_code!==customer))throw new Error('Payment customer mismatch');
  if(providerPlanCode(provider.plan)!==sub.paystack_plan_code)throw new Error('Payment plan mismatch');
  if(sub.paystack_subscription_code&&provider.subscription_code!==sub.paystack_subscription_code)throw new Error('Payment subscription mismatch');
  if(transaction.metadata?.careerdev_ai_subscription_id&&transaction.metadata.careerdev_ai_subscription_id!==sub.id)throw new Error('Payment ownership mismatch');
  const invoice=provider.most_recent_invoice;
  // A customer/plan match alone never links a payment. Require the exact provider transaction ID.
  if(!invoice||String(invoice.transaction?.id??invoice.transaction)!==String(transaction.id)||![true,1].includes(invoice.paid))throw new Error('Matching paid invoice is not yet available; reconciliation required');
  const start=Date.parse(invoice.period_start),end=Date.parse(invoice.period_end),paid=Date.parse(transaction.paid_at);
  if(!Number.isFinite(start)||!Number.isFinite(end)||!Number.isFinite(paid)||end<=start||paid>Date.now()+300000||start>Date.now()+300000)throw new Error('Verified paid period required');
  return {reference,status:'success',transaction_id:String(transaction.id),amount_minor:transaction.amount,currency:transaction.currency,
    paid_at:new Date(paid).toISOString(),period_start:new Date(start).toISOString(),period_end:new Date(end).toISOString(),
    subscription_code:provider.subscription_code,customer_code:customer,plan_code:sub.paystack_plan_code};
}
export async function verifySubscriptionPayment(secret:string,sub:any,reference:string,suggestedCode?:string){
  const tx=await paystackRequest(secret,'/transaction/verify/'+encodeURIComponent(reference));
  if(tx?.reference!==reference||tx.status!=='success')throw new Error('Payment is not successful');
  let provider:any;
  const code=sub.paystack_subscription_code||suggestedCode||tx.subscription?.subscription_code||tx.subscription_code;
  if(code)provider=await paystackRequest(secret,'/subscription/'+encodeURIComponent(code));
  else {
    if(!tx.customer?.id)throw new Error('Verified customer identifier required');
    // Discovery is narrowed by customer, but identity is proved by invoice transaction ID.
    const candidates=await paystackRequest(secret,'/subscription?customer='+encodeURIComponent(tx.customer.id)+'&perPage=100');
    const matches=[];
    for(const candidate of Array.isArray(candidates)?candidates:[]){
      if(providerPlanCode(candidate.plan)!==sub.paystack_plan_code)continue;
      const detail=await paystackRequest(secret,'/subscription/'+encodeURIComponent(candidate.subscription_code));
      if(String(detail.most_recent_invoice?.transaction?.id??detail.most_recent_invoice?.transaction)===String(tx.id))matches.push(detail);
    }
    if(matches.length!==1)throw new Error('Exact subscription invoice requires reconciliation');
    provider=matches[0];
  }
  return normalizeVerifiedPayment(sub,tx,provider,reference,secret.startsWith('sk_test_')?'test':'live');
}
export function providerRenewalStopped(provider:any){return ['non-renewing','cancelled','completed'].includes(provider?.status)}
