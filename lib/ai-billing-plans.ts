export type BillingPlan={plan_key:string;name:string;monthly_price:number;annual_price:number;monthly_price_ngn:number|null;annual_price_ngn:number|null;monthly_credits:number;included_agents:string[]};
export function planPrice(plan:BillingPlan,interval:string,currency:string){
 return currency==='NGN'?(interval==='annual'?plan.annual_price_ngn:plan.monthly_price_ngn):(interval==='annual'?plan.annual_price:plan.monthly_price);
}
export function eligibleUpgrade(current:BillingPlan,target:BillingPlan,interval:string,currency:string){
 const before=planPrice(current,interval,currency),after=planPrice(target,interval,currency);
 return before!==null&&after!==null&&Number.isFinite(Number(after))&&Number(after)>Number(before)&&target.monthly_credits>current.monthly_credits&&current.included_agents.every(agent=>target.included_agents.includes(agent));
}
