export type ClientBookingPayment = {
  payment_status?: string | null;
};

export type ClientBookingWithMeetingDetails = {
  booking_status?: string | null;
  meeting_platform_label?: string | null;
  meeting_join_url?: string | null;
  meeting_location_details?: string | null;
};

export function canClientSeeMeetingDetails(input: {
  bookingStatus?: string | null;
  paymentStatus?: string | null;
}): boolean;

export function clientMeetingDetailsAfterPayment(
  booking: ClientBookingWithMeetingDetails | null | undefined,
  payment: ClientBookingPayment | null | undefined,
): {
  platformLabel: string | null;
  joinUrl: string | null;
  locationDetails: string | null;
} | null;
