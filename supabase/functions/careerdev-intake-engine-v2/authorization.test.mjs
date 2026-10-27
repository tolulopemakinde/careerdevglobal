import assert from "node:assert/strict";
import test from "node:test";
import { canAccessIntakeRequest } from "../_shared/intake-authorization.mjs";

const request = {
  clientProfileId: "client-1",
  assignedCoachId: "coach-1",
};

const actor = (id, role, status = "active") => ({ id, role, status });

test("a client can access their own request", () => {
  assert.equal(
    canAccessIntakeRequest(actor("client-1", "client"), request),
    true,
  );
});

test("a different client cannot access another client's request", () => {
  assert.equal(
    canAccessIntakeRequest(actor("client-2", "client"), request),
    false,
  );
});

test("an assigned coach can access the request", () => {
  assert.equal(
    canAccessIntakeRequest(actor("coach-1", "coach"), request),
    true,
  );
});

test("an unassigned coach cannot access the request", () => {
  assert.equal(
    canAccessIntakeRequest(actor("coach-2", "coach"), request),
    false,
  );
  assert.equal(
    canAccessIntakeRequest(actor("coach-2", "coach"), {
      ...request,
      assignedCoachId: null,
    }),
    false,
  );
});

test("staff can access owned requests under the staff policy", () => {
  assert.equal(
    canAccessIntakeRequest(actor("staff-1", "staff"), request),
    true,
  );
});

test("admins can access owned requests under the staff policy", () => {
  assert.equal(
    canAccessIntakeRequest(actor("admin-1", "admin"), request),
    true,
  );
});

test("inactive accounts are denied regardless of role or ownership", () => {
  for (
    const [id, role] of [
      ["client-1", "client"],
      ["coach-1", "coach"],
      ["staff-1", "staff"],
      ["admin-1", "admin"],
    ]
  ) {
    assert.equal(
      canAccessIntakeRequest(actor(id, role, "inactive"), request),
      false,
    );
  }
});

test("unrecognized roles are denied by default", () => {
  assert.equal(
    canAccessIntakeRequest(actor("unknown-1", "analyst"), request),
    false,
  );
});

test("missing and malformed client ownership fail closed for every role", () => {
  const invalidRequests = [
    { assignedCoachId: "coach-1" },
    { clientProfileId: null, assignedCoachId: "coach-1" },
    { clientProfileId: "", assignedCoachId: "coach-1" },
    { clientProfileId: " ", assignedCoachId: "coach-1" },
    { clientProfileId: 42, assignedCoachId: "coach-1" },
  ];
  const actors = [
    actor("client-1", "client"),
    actor("coach-1", "coach"),
    actor("staff-1", "staff"),
    actor("admin-1", "admin"),
  ];

  for (const currentActor of actors) {
    for (const invalidRequest of invalidRequests) {
      assert.equal(
        canAccessIntakeRequest(currentActor, invalidRequest),
        false,
      );
    }
  }
});

test("missing and malformed coach assignments fail closed", () => {
  const invalidAssignments = [
    undefined,
    null,
    "",
    " ",
    42,
  ];

  for (const assignedCoachId of invalidAssignments) {
    assert.equal(
      canAccessIntakeRequest(
        actor("coach-1", "coach"),
        { clientProfileId: "client-1", assignedCoachId },
      ),
      false,
    );
  }
});

test("missing or malformed actors and requests fail closed", () => {
  assert.equal(canAccessIntakeRequest(null, request), false);
  assert.equal(canAccessIntakeRequest(actor("", "client"), request), false);
  assert.equal(
    canAccessIntakeRequest(actor("client-1", "client"), null),
    false,
  );
});
