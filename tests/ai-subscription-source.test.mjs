import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeVerifiedPayment,assertProviderSubscription} from '../supabase/functions/_shared/ai-billing-provider.ts';
import {eligibleUpgrade} from '../lib/ai-billing-plans.ts';
const sub={id:'a',amount:10,currency:'USD',paystack_plan_code:'PLN_a',paystack_subscription_code:'SUB_a',paystack_customer_code:'CUS_a'};
const tx={id:123,reference:'ref-a',status:'success',domain:'test',amount:1000,currency:'USD',paid_at:'2026-10-31T12:00:00Z',customer:{customer_code:'CUS_a'},metadata:{careerdev_ai_subscription_id:'a'}};
const provider={subscription_code:'SUB_a',customer:{customer_code:'CUS_a'},amount:1000,plan:{plan_code:'PLN_a',currency:'USD'},most_recent_invoice:{transaction:123,paid:true,period_start:'2026-10-31T12:00:00Z',period_end:'2026-11-28T12:00:00Z'}};
const normalize=(t=tx,p=provider,s=sub)=>normalizeVerifiedPayment(s,t,p,'ref-a','test');
test('exact verified provider invoice produces a normalized paid period',()=>{const r=normalize();assert.equal(r.amount_minor,1000);assert.equal(r.subscription_code,'SUB_a');assert.equal(r.period_end,'2026-11-28T12:00:00.000Z');assert.equal('email_token' in r,false)});
for(const [name,patch]of [['wrong amount',{amount:999}],['wrong currency',{currency:'NGN'}],['pending status',{status:'pending'}],['wrong reference',{reference:'other'}],['wrong provider mode',{domain:'live'}],['missing paid date',{paid_at:null}],['another account metadata',{metadata:{careerdev_ai_subscription_id:'b'}}],['another customer',{customer:{customer_code:'CUS_b'}}]]){
 test('reject '+name,()=>assert.throws(()=>normalize({...tx,...patch})));
}
test('shared customer and plan cannot establish invoice identity',()=>assert.throws(()=>normalize(tx,{...provider,most_recent_invoice:{...provider.most_recent_invoice,transaction:456}}),/invoice/));
test('missing provider dates cannot activate entitlements',()=>assert.throws(()=>normalize(tx,{...provider,most_recent_invoice:{...provider.most_recent_invoice,period_end:null}})));
test('cancellation validates customer and plan as well as subscription code',()=>{assert.doesNotThrow(()=>assertProviderSubscription(sub,provider));assert.throws(()=>assertProviderSubscription(sub,{...provider,customer:{customer_code:'CUS_b'}}));assert.throws(()=>assertProviderSubscription(sub,{...provider,plan:{plan_code:'PLN_b',currency:'USD'}}))});
const current={plan_key:'a',name:'A',monthly_price:10,annual_price:100,monthly_price_ngn:10000,annual_price_ngn:100000,monthly_credits:10,included_agents:['one']};
const higher={...current,plan_key:'b',monthly_price:20,annual_price:200,monthly_price_ngn:20000,annual_price_ngn:200000,monthly_credits:20,included_agents:['one','two']};
test('higher credit and price tier with all current agents is eligible',()=>assert.equal(eligibleUpgrade(current,higher,'annual','NGN'),true));
test('downgrade, equal-price tier and lost agents are not upgrades',()=>{assert.equal(eligibleUpgrade(higher,current,'monthly','USD'),false);assert.equal(eligibleUpgrade(current,{...higher,monthly_price:10},'monthly','USD'),false);assert.equal(eligibleUpgrade(current,{...higher,included_agents:['two']},'monthly','USD'),false)});
test('unconfigured target currency is not eligible',()=>assert.equal(eligibleUpgrade(current,{...higher,monthly_price_ngn:null},'monthly','NGN'),false));
