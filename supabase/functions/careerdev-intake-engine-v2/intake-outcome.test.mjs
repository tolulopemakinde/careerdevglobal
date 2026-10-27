import assert from "node:assert/strict";
import test from "node:test";
import {
  mapIntakeRecommendation,
  persistIntakeStatuses,
} from "../_shared/intake-outcome.mjs";

test("all supported recommendations map to schema-approved persisted statuses", () => {
  assert.deepEqual(mapIntakeRecommendation("awaiting_client"), {
    intakeSessionStatus: "awaiting_client",
    serviceRequestStatus: "awaiting_client",
    humanReviewStatus: "pending",
    aiApprovalStatus: "not_required",
  });
  assert.deepEqual(mapIntakeRecommendation("awaiting_review"), {
    intakeSessionStatus: "awaiting_review",
    serviceRequestStatus: "awaiting_review",
    humanReviewStatus: "required",
    aiApprovalStatus: "pending",
  });
  assert.deepEqual(mapIntakeRecommendation("ready"), {
    intakeSessionStatus: "ready",
    serviceRequestStatus: "awaiting_review",
    humanReviewStatus: "required",
    aiApprovalStatus: "pending",
  });
  assert.deepEqual(mapIntakeRecommendation("blocked"), {
    intakeSessionStatus: "blocked",
    serviceRequestStatus: "blocked",
    humanReviewStatus: "required",
    aiApprovalStatus: "pending",
  });
});

test("unsupported or malformed recommendations cannot be persisted", () => {
  for (const recommendation of [undefined, null, 1, "", "approved", "queued"]) {
    assert.equal(mapIntakeRecommendation(recommendation), null);
  }
});

test("final status persistence succeeds only after both records are updated", async () => {
  const calls = [];
  const result = await persistIntakeStatuses({
    updateSession: async () => {
      calls.push("session");
      return { data: { id: "session-1" }, error: null };
    },
    updateRequest: async () => {
      calls.push("request");
      return { data: { id: "request-1" }, error: null };
    },
  });

  assert.deepEqual(calls, ["session", "request"]);
  assert.deepEqual(result, {
    success: true,
    intakeSessionUpdated: true,
    serviceRequestUpdated: true,
  });
});

test("a session update error prevents the request update", async () => {
  let requestUpdateCalled = false;
  const result = await persistIntakeStatuses({
    updateSession: async () => ({
      data: null,
      error: { code: "42501", message: "sensitive database text" },
    }),
    updateRequest: async () => {
      requestUpdateCalled = true;
      return { data: { id: "request-1" }, error: null };
    },
  });

  assert.equal(requestUpdateCalled, false);
  assert.deepEqual(result, {
    success: false,
    failedStep: "intake_session",
    intakeSessionUpdated: false,
    serviceRequestUpdated: false,
  });
  assert.equal("error" in result, false);
});

test("a request update error reports the committed session as partial success", async () => {
  const result = await persistIntakeStatuses({
    updateSession: async () => ({
      data: { id: "session-1" },
      error: null,
    }),
    updateRequest: async () => ({
      data: null,
      error: { code: "42501", message: "sensitive database text" },
    }),
  });

  assert.deepEqual(result, {
    success: false,
    failedStep: "service_request",
    intakeSessionUpdated: true,
    serviceRequestUpdated: false,
  });
});

test("a status update that matches no row is treated as a failure", async () => {
  const result = await persistIntakeStatuses({
    updateSession: async () => ({ data: null, error: null }),
    updateRequest: async () => ({ data: { id: "request-1" }, error: null }),
  });

  assert.deepEqual(result, {
    success: false,
    failedStep: "intake_session",
    intakeSessionUpdated: false,
    serviceRequestUpdated: false,
  });
});

test("thrown persistence errors are returned without their contents", async () => {
  const result = await persistIntakeStatuses({
    updateSession: async () => {
      throw new Error("sensitive database text");
    },
    updateRequest: async () => ({ data: { id: "request-1" }, error: null }),
  });

  assert.deepEqual(result, {
    success: false,
    failedStep: "intake_session",
    intakeSessionUpdated: false,
    serviceRequestUpdated: false,
  });
});
