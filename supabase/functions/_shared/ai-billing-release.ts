type BillingAction={projectUrl:string;secret:string;userId:string;action:string;planKey?:unknown;interval?:unknown;currency?:unknown};
const testProject='https://yyevuwvtrktrzwuzeddo.supabase.co';
const approval='owner-paid-fresher-20261104-a';
// Production keeps the existing global release control. A separate, private
// authorization can admit only the explicitly approved TEST fixture and budget.
export async function billingActionAllowed(sb:any,input:BillingAction){
 try{
  const global=await sb.from('ai_billing_release_config').select('self_service_enabled').eq('id',true).maybeSingle();
  if(global.error||!global.data)return false;
  if(global.data.self_service_enabled===true)return true;
  if(global.data.self_service_enabled!==false||input.projectUrl!==testProject||!input.secret.startsWith('sk_test_')||!['checkout','cancel'].includes(input.action))return false;
  const authorized=await sb.from('ai_billing_test_authorizations').select('*').eq('user_id',input.userId).maybeSingle();
  if(authorized.error)return false;
  const scope=authorized.data,now=Date.now(),created=Date.parse(scope?.created_at),expires=Date.parse(scope?.expires_at);
  if(!scope||scope.user_id!==input.userId||scope.enabled!==true||scope.approval_reference!==approval||scope.project_ref!=='yyevuwvtrktrzwuzeddo'
   ||!Number.isFinite(created)||!Number.isFinite(expires)||created>now+60000||expires<=now||expires<=created||expires-created>86400000
   ||scope.plan_key!=='fresher'||scope.billing_interval!=='monthly'||scope.currency!=='NGN'||scope.amount_minor!==750000||scope.monthly_credits!==25)return false;
  const plan=await sb.from('ai_agent_subscription_plans').select('active,monthly_price_ngn,monthly_credits').eq('plan_key',scope.plan_key).single();
  if(plan.error||plan.data?.active!==true||Number(plan.data.monthly_price_ngn)!==7500||plan.data.monthly_credits!==25)return false;
  const operations=await sb.from('ai_billing_operations').select('id,status,subscription_id').eq('user_id',input.userId).eq('action','checkout');
  if(operations.error||!Array.isArray(operations.data)||operations.data.length>1)return false;
  if(input.action==='checkout'){
   if(input.planKey!==scope.plan_key||input.interval!==scope.billing_interval||input.currency!==scope.currency)return false;
   // Recovery may return the same pending checkout. A confirmed operation can
   // never open a second payment, including after the first paid term expires.
   return operations.data.length===0||['prepared','provider_requested'].includes(operations.data[0].status);
  }
  if(operations.data.length!==1||operations.data[0].status!=='confirmed')return false;
  const sub=await sb.from('ai_agent_subscriptions').select('user_id,plan_key,billing_interval,currency,amount,paystack_transaction_reference').eq('id',operations.data[0].subscription_id).single();
  if(sub.error||sub.data?.user_id!==input.userId||sub.data.plan_key!==scope.plan_key||sub.data.billing_interval!==scope.billing_interval||sub.data.currency!==scope.currency||Number(sub.data.amount)!==7500)return false;
  const payment=await sb.from('ai_subscription_payments').select('subscription_id,amount_minor,currency').eq('reference',sub.data.paystack_transaction_reference).single();
  if(payment.error||payment.data?.subscription_id!==operations.data[0].subscription_id||Number(payment.data.amount_minor)!==750000||payment.data.currency!=='NGN')return false;
  const cancellations=await sb.from('ai_billing_operations').select('id,status,subscription_id').eq('user_id',input.userId).eq('action','cancel');
  if(cancellations.error||!Array.isArray(cancellations.data)||cancellations.data.length>1)return false;
  return cancellations.data.length===0||(cancellations.data[0].subscription_id===operations.data[0].subscription_id&&['prepared','provider_requested'].includes(cancellations.data[0].status));
 }catch{return false}
}
