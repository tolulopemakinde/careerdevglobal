/** @type {Record<string, { intakeSessionStatus: string, serviceRequestStatus: string, humanReviewStatus: string, aiApprovalStatus: string }>} */
const outcomes = Object.freeze({
  awaiting_client: Object.freeze({
    intakeSessionStatus: "awaiting_client",
    serviceRequestStatus: "awaiting_client",
    humanReviewStatus: "pending",
    aiApprovalStatus: "not_required",
  }),
  awaiting_review: Object.freeze({
    intakeSessionStatus: "awaiting_review",
    serviceRequestStatus: "awaiting_review",
    humanReviewStatus: "required",
    aiApprovalStatus: "pending",
  }),
  ready: Object.freeze({
    intakeSessionStatus: "ready",
    serviceRequestStatus: "awaiting_review",
    humanReviewStatus: "required",
    aiApprovalStatus: "pending",
  }),
  blocked: Object.freeze({
    intakeSessionStatus: "blocked",
    serviceRequestStatus: "blocked",
    humanReviewStatus: "required",
    aiApprovalStatus: "pending",
  }),
});

/**
 * Map a validated model recommendation onto the database workflow statuses.
 *
 * @param {unknown} recommendation
 * @returns {{
 *   intakeSessionStatus: string,
 *   serviceRequestStatus: string,
 *   humanReviewStatus: string,
 *   aiApprovalStatus: string,
 * } | null}
 */
export function mapIntakeRecommendation(recommendation) {
  if (typeof recommendation !== "string") return null;
  const outcome = outcomes[recommendation];
  return outcome ? { ...outcome } : null;
}

/**
 * Persist final session and request statuses sequentially and report partial
 * success without exposing database error details.
 *
 * @param {{
 *   updateSession: () => PromiseLike<{ data?: { id?: string } | null, error?: unknown }>,
 *   updateRequest: () => PromiseLike<{ data?: { id?: string } | null, error?: unknown }>,
 * }} writes
 */
export async function persistIntakeStatuses({ updateSession, updateRequest }) {
  let intakeSessionUpdated = false;
  let serviceRequestUpdated = false;

  try {
    const sessionResult = await updateSession();
    if (sessionResult?.error || !sessionResult?.data?.id) {
      return {
        success: false,
        failedStep: "intake_session",
        intakeSessionUpdated,
        serviceRequestUpdated,
      };
    }
    intakeSessionUpdated = true;
  } catch {
    return {
      success: false,
      failedStep: "intake_session",
      intakeSessionUpdated,
      serviceRequestUpdated,
    };
  }

  try {
    const requestResult = await updateRequest();
    if (requestResult?.error || !requestResult?.data?.id) {
      return {
        success: false,
        failedStep: "service_request",
        intakeSessionUpdated,
        serviceRequestUpdated,
      };
    }
    serviceRequestUpdated = true;
  } catch {
    return {
      success: false,
      failedStep: "service_request",
      intakeSessionUpdated,
      serviceRequestUpdated,
    };
  }

  return {
    success: true,
    intakeSessionUpdated,
    serviceRequestUpdated,
  };
}
