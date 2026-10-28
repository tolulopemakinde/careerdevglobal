import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNoAiFallback } from '../supabase/functions/careerdev-ai-agent-runtime/fallback.ts';
import { PILOT_VERSION, pilotAmount, matchesPlan, validPilotPayment } from '../supabase/functions/_shared/pilot-billing.ts';
const nonAi=['career_assessment_agent','skills_gaps_agent','learning_development_agent','talent_mobility_agent','ethics_quality_assurance_agent'];
const optional=['career_discovery_agent','career_coach_agent','job_search_intelligence_agent','academic_career_transition_agent','employer_talent_agent','career_research_agent'];
for(const key of [...nonAi,...optional]) test(`${key} returns structured evidence without AI`,()=>{
 const input={target_role:'Analyst',skills:['SQL'],gaps:['Statistics'],goals:['Build a portfolio']};
 const out=buildNoAiFallback({agent_key:key},input,nonAi.includes(key)?'works_without_ai':'ai_optional','pilot_no_ai');
 assert.equal(out.generated_by_ai,false);assert.equal(out.human_approved,false);
 assert.equal(out.verification_gate,false);assert.deepEqual(out.input_preserved,input);
 assert.ok(out.summary);assert.ok(out.recommendations.length);assert.ok(out.next_steps.length);
});
test('required and unknown agents fail closed',()=>{
 assert.throws(()=>buildNoAiFallback({agent_key:'cv_resume_agent'},{},'ai_required','pilot'));
 assert.throws(()=>buildNoAiFallback({agent_key:'unknown'},{},'ai_optional','pilot'));
});
test('all 20 approved billing selections',()=>{
 const expected={fresher:[2.99,29.9,4500,45000],starter:[4.99,49.9,7500,75000],professional:[7.99,79.9,12000,120000],career_pro:[11.99,119.9,18000,180000],elite:[14.99,149.9,22500,225000]};
 for(const [key,values] of Object.entries(expected)) for(const [i,[currency,interval]] of [['USD','monthly'],['USD','annual'],['NGN','monthly'],['NGN','annual']].entries()) assert.equal(pilotAmount(key,interval,currency),values[i]);
 assert.throws(()=>pilotAmount('fresher','weekly','USD'));
 assert.equal(matchesPlan({plan_code:'old',amount:499,currency:'USD',interval:'monthly'},'old',2.99,'monthly','USD'),false);
});
test('payment identity, amount, currency and cancelled record protections',()=>{
 const sub={id:'synthetic',status:'pending',plan_key:'fresher',billing_interval:'monthly',currency:'NGN',amount:4500,paystack_plan_code:'new',paystack_transaction_reference:'CDG-AI-test',metadata:{pilot_version:PILOT_VERSION}};
 const data={reference:'CDG-AI-test',currency:'NGN',amount:450000,plan:{plan_code:'new'},metadata:{careerdev_ai_subscription_id:'synthetic'},paid_at:'2026-10-28T00:00:00Z'};
 assert.equal(validPilotPayment(sub,data),true);
 for(const change of [{amount:750000},{currency:'USD'},{reference:'other'},{plan:{plan_code:'old'}},{metadata:{careerdev_ai_subscription_id:'other'}}]) assert.equal(validPilotPayment(sub,{...data,...change}),false);
 assert.equal(validPilotPayment({...sub,status:'cancelled'},data),false);
});
