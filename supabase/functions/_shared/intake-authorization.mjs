/**
 * Apply the service_requests ownership policy before the Edge Function reads
 * or writes request-scoped career information.
 *
 * @param {{ id: string, role: string, status: string }} actor
 * @param {{ clientProfileId: string | null, assignedCoachId: string | null }} request
 */
export function canAccessIntakeRequest(actor, request) {
  if (actor.status !== "active") return false;

  switch (actor.role) {
    case "client":
      return actor.id === request.clientProfileId;
    case "coach":
      return Boolean(request.assignedCoachId) && actor.id === request.assignedCoachId;
    case "staff":
    case "admin":
      return true;
    default:
      return false;
  }
}
