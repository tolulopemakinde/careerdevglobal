export type BillingPlan={plan_key:string;name:string;monthly_price:number;annual_price:number;monthly_price_ngn:number|null;annual_price_ngn:number|null;monthly_credits:number;included_agents:string[]};
export function planPrice(plan:BillingPlan,interval:string,currency:string){
 return currency==='NGN'?(interval==='annual'?plan.annual_price_ngn:plan.monthly_price_ngn):(interval==='annual'?plan.annual_price:plan.monthly_price);
}
export function eligibleUpgrade(current:BillingPlan,target:BillingPlan,interval:string,currency:string){
 const before=planPrice(current,interval,currency),after=planPrice(target,interval,currency);
 return before!==null&&after!==null&&Number.isFinite(Number(after))&&Number(after)>Number(before)&&target.monthly_credits>current.monthly_credits&&current.included_agents.every(agent=>target.included_agents.includes(agent));
}

export type AccountSubscriptionCandidate={
 status:string;
 current_period_end:string|null;
};
// Select only unexpired paid records (or pending setup); retain the latest historical
// row for display when there is no current subscription. Input is newest-first.
export function selectAccountSubscription<T extends AccountSubscriptionCandidate>(rows:T[],now=Date.now()):T|null{
 const current=rows.filter(row=>{
  if(row.status==='pending')return true;
  if(!['active','attention','non_renewing'].includes(row.status))return false;
  const end=row.current_period_end?Date.parse(row.current_period_end):NaN;
  return Number.isFinite(end)&&end>now;
 });
 if(current.length>1)throw new Error('Multiple billing records require reconciliation. Contact support before making another payment.');
 return current[0]??rows[0]??null;
}
