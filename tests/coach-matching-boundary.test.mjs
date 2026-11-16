import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../supabase/functions/careerdev-coach-matching/index.ts',import.meta.url),'utf8');
test('restricted matching retrieval uses server authorization after input validation',()=>{
 const at=source.indexOf('const supabase = createClient(supabaseUrl, serviceRoleKey');
 assert.ok(at>source.indexOf('validateCoachMatchingInput(parsed.value)'));
 assert.ok(source.indexOf('if (!serviceRoleKey) return securityError',source.indexOf('validateCoachMatchingInput(parsed.value)'))<at);
 assert.ok(!source.includes('createClient(supabaseUrl, publishableKey)'));
});
test('matching response preserves only public coach projections',()=>{
 assert.match(source,/const available = list.map\(publicCoach\)/);
 assert.match(source,/scored.push\(\{ \.\.\.publicCoach\(coach\)/);
 const projection=source.slice(source.indexOf('const publicCoach'),source.indexOf('Deno.serve'));
 assert.ok(!projection.includes('source_text'));
 assert.ok(!projection.includes('email'));
 assert.ok(!projection.includes('credentials'));
});
test('public origin, bounded-input and distributed quota checks are retained',()=>{
 for(const boundary of ['FORBIDDEN_ORIGIN','consumeDistributedRateLimit','consumeSharedQuota','readJsonWithLimit','validateCoachMatchingInput']) assert.ok(source.includes(boundary));
});
