import assert from "node:assert/strict";
import test from "node:test";
import { canAccessIntakeRequest } from "../_shared/intake-authorization.mjs";

const request = {
  clientProfileId: "client-1",
  assignedCoachId: "coach-1",
};

const actor = (id, role, status = "active") => ({ id, role, status });

test("a client can access their own request", () => {
  assert.equal(canAccessIntakeRequest(actor("client-1", "client"), request), true);
});

test("a client cannot access another client's request, even if assigned as coach", () => {
  assert.equal(canAccessIntakeRequest(actor("coach-1", "client"), request), false);
});

test("an assigned coach can access the request", () => {
  assert.equal(canAccessIntakeRequest(actor("coach-1", "coach"), request), true);
});

test("an unassigned coach cannot access the request", () => {
  assert.equal(canAccessIntakeRequest(actor("coach-2", "coach"), request), false);
  assert.equal(
    canAccessIntakeRequest(actor("coach-2", "coach"), { ...request, assignedCoachId: null }),
    false,
  );
});

test("staff can access requests under the staff policy", () => {
  assert.equal(canAccessIntakeRequest(actor("staff-1", "staff"), request), true);
  assert.equal(
    canAccessIntakeRequest(actor("staff-1", "staff"), { ...request, assignedCoachId: null }),
    true,
  );
});

test("admins can access requests under the staff policy", () => {
  assert.equal(canAccessIntakeRequest(actor("admin-1", "admin"), request), true);
  assert.equal(
    canAccessIntakeRequest(actor("admin-1", "admin"), { ...request, assignedCoachId: null }),
    true,
  );
});

test("inactive accounts are denied regardless of role or ownership", () => {
  for (const [id, role] of [
    ["client-1", "client"],
    ["coach-1", "coach"],
    ["staff-1", "staff"],
    ["admin-1", "admin"],
  ]) {
    assert.equal(canAccessIntakeRequest(actor(id, role, "inactive"), request), false);
  }
});

test("unrecognized roles are denied by default", () => {
  assert.equal(canAccessIntakeRequest(actor("unknown-1", "analyst"), request), false);
});
