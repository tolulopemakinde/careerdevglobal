/**
 * Apply the service_requests ownership policy before the Edge Function reads
 * or writes request-scoped career information.
 *
 * @param {{ id?: unknown, role?: unknown, status?: unknown } | null} actor
 * @param {{ clientProfileId?: unknown, assignedCoachId?: unknown } | null} request
 */
export function canAccessIntakeRequest(actor, request) {
  const isIdentifier = (value) =>
    typeof value === "string" && value.length > 0 && value.trim() === value;

  if (
    !actor ||
    typeof actor !== "object" ||
    actor.status !== "active" ||
    !isIdentifier(actor.id) ||
    !request ||
    typeof request !== "object" ||
    !isIdentifier(request.clientProfileId)
  ) {
    return false;
  }

  switch (actor.role) {
    case "client":
      return actor.id === request.clientProfileId;
    case "coach":
      return isIdentifier(request.assignedCoachId) &&
        actor.id === request.assignedCoachId;
    case "staff":
    case "admin":
      return true;
    default:
      return false;
  }
}
