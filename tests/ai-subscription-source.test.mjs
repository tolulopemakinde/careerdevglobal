import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Source-level regression guards. These do not replace Paystack sandbox or E2E tests.
const webhook=readFileSync(new URL('../supabase/functions/careerdev-paystack-webhook/index.ts',import.meta.url),'utf8');
const management=readFileSync(new URL('../app/account/ai-subscription/page.tsx',import.meta.url),'utf8');
const endpoint=readFileSync(new URL('../supabase/functions/careerdev-ai-subscription-manage/index.ts',import.meta.url),'utf8');

test('webhook rejects conflicting subscription identifiers',()=>{
 assert.match(webhook,/Conflicting subscription identifiers/);
 assert.match(webhook,/sub\.id!==r\.data\.id/);
});
test('webhook never uses shared plan or customer codes as fallback identity',()=>{
 assert.doesNotMatch(webhook,/\.eq\("plan_key",r\.data\.plan_key\)/);
 assert.doesNotMatch(webhook,/\.eq\("paystack_customer_code",cc\)/);
});
test('webhook protects paid period when renewals stop',()=>{
 assert.match(webhook,/type==="subscription\.disable"/);
 assert.match(webhook,/new Date\(sub\.current_period_end\)>new Date\(\)/);
 assert.match(webhook,/"non_renewing":"cancelled"/);
});
test('webhook does not reactivate non-renewing accounts on payment updates',()=>{
 assert.match(webhook,/sub\.status!=="non_renewing"/);
});
test('account UI does not offer unverified cancellation',()=>{
 assert.match(management,/cancellationReady=false/);
 assert.match(management,/disabled=\{busy\|\|!cancellationReady\}/);
});
test('cancellation endpoint requires a signed-in user and scoped lookup',()=>{
 assert.match(endpoint,/client\.auth\.getUser\(\)/);
 assert.match(endpoint,/\.eq\("user_id",user\.id\)/);
 assert.match(endpoint,/subscription\/disable/);
});
