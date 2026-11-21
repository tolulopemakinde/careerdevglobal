const settledPaymentStates = new Set(['paid', 'captured', 'settled']);

function safeHttpsUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Display-only safeguard for client dashboards. It is not an authorization
 * boundary: the database must independently withhold meeting details.
 */
export function canClientSeeMeetingDetails({ bookingStatus, paymentStatus }) {
  return bookingStatus === 'confirmed' && settledPaymentStates.has(
    String(paymentStatus ?? '').trim().toLowerCase(),
  );
}

/** Return meeting details only when the client-facing display rule is met. */
export function clientMeetingDetailsAfterPayment(booking, payment) {
  if (!booking || !payment || !canClientSeeMeetingDetails({
    bookingStatus: booking.booking_status,
    paymentStatus: payment.payment_status,
  })) return null;

  return {
    platformLabel: booking.meeting_platform_label ?? null,
    joinUrl: safeHttpsUrl(booking.meeting_join_url),
    locationDetails: booking.meeting_location_details ?? null,
  };
}
