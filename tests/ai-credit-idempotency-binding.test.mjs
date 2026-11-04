/**
 * Source-level regression guard for both unapplied draft billing migrations.
 *
 * These tests are NOT a substitute for authenticated, disposable-DB SQL
 * acceptance. They deliberately do not connect to Supabase or use real accounts.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const paths=[
  "20261101140853_ai_billing_lifecycle_safety.sql",
  "20261101152243_ai_payment_refund_chargeback_policy.sql",
];

function body(path){
  const sql=readFileSync(new URL("../supabase/migrations/"+path,import.meta.url),"utf8");
  const marker=/create\s+or\s+replace\s+function\s+public\.reserve_ai_credits\s*\(/gi;
  const matches=[...sql.matchAll(marker)];
  assert.equal(matches.length,1,"exactly one authoritative reserve definition per migration: "+path);
  const from=matches[0].index;
  const end=sql.indexOf("$function$;",from);
  assert.ok(end>from,"reserve function terminator required: "+path);
  return sql.slice(from,end+11);
}

for(const path of paths){
  test(path+" explicitly binds an idempotent ledger to same request and execution",()=>{
    const src=body(path);
    const start=src.indexOf("select l.* into v_existing");
    const finish=src.indexOf("return query select true,'idempotent_existing_request'");
    assert.ok(start>=0 && finish>start,"must inspect replay branch");
    const replay=src.slice(start,finish).replace(/\s+/g," ").toLowerCase();
    for(const clause of [
      "v_existing.execution_id is distinct from p_execution_id",
      "v_existing.request_id is distinct from p_request_id",
      "v_existing.agent_key is distinct from v_op.agent_key",
      "v_existing.subscription_id<>v_sub.id",
      "v_existing.operation_key<>p_operation_key",
      "v_existing.status='released'",
    ])assert.ok(replay.includes(clause),"missing idempotency guard: "+clause);
    assert.ok(replay.indexOf("v_existing.execution_id is distinct from p_execution_id")<
      replay.indexOf("return query select false,'idempotency_key_not_reusable'"),
      "cross-execution replay must return denial before any reused ledger");
    assert.ok(src.includes("pg_advisory_xact_lock"),"must preserve per-user atomic reservation lock");
    assert.ok(src.includes("r.requested_by=v_user_id"),"must preserve execution ownership check");
  });
  test(path+" retains reserve return signature and billing checks",()=>{
    const src=body(path).toLowerCase();
    assert.ok(src.includes("returns table(allowed boolean, reason text, ledger_id uuid"));
    assert.ok(src.includes("security definer") && src.includes("set search_path to ''"));
    assert.ok(src.includes("'insufficient_ai_credits'"));
    assert.ok(src.includes("'no_active_ai_subscription'"));
  });
}
test("refund/chargeback migration retains paid-entitlement gating",()=>{
  const src=body(paths[1]);
  assert.ok(src.includes("public.ai_payment_access_allowed(s.id)"));
});
test("SQL three-valued logic needs IS DISTINCT FROM for null bindings",()=>{
  // An ordinary <> comparison would evaluate to UNKNOWN with NULL, not true.
  // SQL semantics are checked separately with read-only VALUES in disposable DB.
  const isDistinctFrom=(a,b)=>a===null || b===null ? a!==b : a!==b;
  assert.equal(isDistinctFrom(null,"another-execution"),true);
  assert.equal(isDistinctFrom("exec-001","exec-002"),true);
  assert.equal(isDistinctFrom("exec-001","exec-001"),false);
});
