import test from "node:test";
import assert from "node:assert/strict";
import {assessExistingCreditReservation} from "../lib/ai/pilot/credit-contract-policy.mjs";
const entry=()=>({
 userId:"owner",operationKey:"career_discovery_agent",subscriptionId:"sub-001",
 executionId:"exec-001",requestId:"req-001",idempotencyKey:"key-001",
 status:"reserved",runtimeClaimedAt:null,
});
test("only exact unclaimed binding is reusable in offline contract specification",()=>{
 const x=entry();
 assert.deepEqual(assessExistingCreditReservation(x,{...x}),{reusable:true,reason:"EXACT_UNCLAIMED_MATCH"});
});
test("same idempotency key with different execution/request must fail closed",()=>{
 const x=entry();
 for(const key of ["executionId","requestId"]){
  const incoming={...x,[key]:x[key]+"-another"};
  const result=assessExistingCreditReservation(x,incoming);
  assert.equal(result.reusable,false);
  assert.equal(result.reason,"MISMATCH_"+key.replace(/[A-Z]/g,m=>"_"+m.toLowerCase()).toUpperCase());
 }
});
test("cross-account, subscription or agent cannot reuse a reserved ledger",()=>{
 const x=entry();
 for(const key of ["userId","subscriptionId","operationKey","idempotencyKey"]){
  assert.equal(assessExistingCreditReservation(x,{...x,[key]:"different"}).reusable,false);
 }
});
test("claimed, consumed, released and incomplete records cannot be reused",()=>{
 const x=entry();
 for(const v of [
  {...x,status:"consumed"},{...x,status:"released"},
  {...x,runtimeClaimedAt:"2026-11-04T00:00:00Z"},
  {...x,executionId:null},{...x,requestId:null},
 ])assert.equal(assessExistingCreditReservation(v,x).reusable,false);
});
test("missing binding never authorizes replay",()=>{
 assert.equal(assessExistingCreditReservation(null,entry()).reusable,false);
 assert.equal(assessExistingCreditReservation(entry(),null).reusable,false);
});
