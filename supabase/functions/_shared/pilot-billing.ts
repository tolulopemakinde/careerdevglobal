export const PILOT_VERSION = 'no-openai-2026-v1';
export const PILOT_PRICES: Record<string, number[]> = {
  fresher: [2.99,29.90,4500,45000], starter: [4.99,49.90,7500,75000],
  professional: [7.99,79.90,12000,120000], career_pro: [11.99,119.90,18000,180000],
  elite: [14.99,149.90,22500,225000],
};
export function pilotAmount(plan: string, interval: string, currency: string): number {
  if (!['monthly','annual'].includes(interval) || !['USD','NGN'].includes(currency) || !Object.hasOwn(PILOT_PRICES,plan)) throw new Error('Invalid pilot billing selection');
  return PILOT_PRICES[plan][(currency==='NGN'?2:0)+(interval==='annual'?1:0)];
}
export function matchesPlan(data: any, code: string, amount: number, interval: string, currency: string): boolean {
  return data?.plan_code===code && data?.is_deleted!==true && data?.is_archived!==true &&
    Number(data?.amount)===Math.round(amount*100) && data?.currency===currency &&
    data?.interval===(interval==='annual'?'annually':'monthly');
}
export function validPilotPayment(sub: any, data: any): boolean {
  if (!['pending','active','non_renewing'].includes(sub.status) || sub.metadata?.pilot_version!==PILOT_VERSION) return false;
  let amount: number;
  try { amount=pilotAmount(sub.plan_key,sub.billing_interval,sub.currency); } catch { return false; }
  const code=data?.plan?.plan_code ?? data?.plan_object?.plan_code ?? data?.subscription?.plan?.plan_code;
  return data?.reference===sub.paystack_transaction_reference && data?.currency===sub.currency &&
    Number(sub.amount)===amount && Number(data?.amount)===Math.round(amount*100) &&
    code===sub.paystack_plan_code && data?.metadata?.careerdev_ai_subscription_id===sub.id &&
    typeof data?.paid_at==='string' && Number.isFinite(Date.parse(data.paid_at));
}
