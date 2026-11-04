import test from "node:test";
import assert from "node:assert/strict";
import {nextSubscriptionStatus as next,resolveSubscriptionIdentity as resolve} from "../lib/ai-billing-lifecycle.mjs";
test("cancellation retains paid access until expiry",()=>{assert.equal(next("active","subscription.disable","", "2030-01-01T00:00:00Z",Date.parse("2029-12-01T00:00:00Z")),"non_renewing");assert.equal(next("active","subscription.disable","", "2029-01-01T00:00:00Z",Date.parse("2029-12-01T00:00:00Z")),"cancelled")});
test("non-renewing is not reactivated or marked attention",()=>{for(const event of ["charge.success","subscription.create","invoice.payment_failed","invoice.update"])assert.equal(next("non_renewing",event,"failed"),"non_renewing")});
test("terminal subscriptions stay terminal",()=>{for(const status of ["cancelled","expired"])assert.equal(next(status,"charge.success"),status)});
test("payment failure requires action",()=>assert.equal(next("active","invoice.payment_failed"),"attention"));
test("provider identifiers must agree",()=>{assert.throws(()=>resolve({id:"a"},{id:"b"}),/Conflicting/);assert.equal(resolve({id:"a"},{id:"a"}).id,"a");assert.equal(resolve(null,null),null)});
