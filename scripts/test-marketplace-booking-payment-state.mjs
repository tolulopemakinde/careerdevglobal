import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canClientSeeMeetingDetails,
  clientMeetingDetailsAfterPayment,
} from '../lib/marketplace/booking-payment-state.mjs';

const booking = {
  booking_status: 'confirmed',
  meeting_platform_label: 'Calendly video call',
  meeting_join_url: 'https://meet.example.test/synthetic',
  meeting_location_details: 'Synthetic meeting details',
};

test('client meeting details require a confirmed booking and settled payment', () => {
  for (const paymentStatus of ['paid', 'captured', 'settled']) {
    assert.equal(canClientSeeMeetingDetails({ bookingStatus: 'confirmed', paymentStatus }), true);
    assert.deepEqual(clientMeetingDetailsAfterPayment(booking, { payment_status: paymentStatus }), {
      platformLabel: booking.meeting_platform_label,
      joinUrl: booking.meeting_join_url,
      locationDetails: booking.meeting_location_details,
    });
  }
});

test('requested or cancelled bookings never show meeting details, even if payment says paid', () => {
  for (const bookingStatus of ['requested', 'cancelled', 'declined', 'pending', null]) {
    assert.equal(canClientSeeMeetingDetails({ bookingStatus, paymentStatus: 'paid' }), false);
    assert.equal(clientMeetingDetailsAfterPayment({ ...booking, booking_status: bookingStatus }, { payment_status: 'paid' }), null);
  }
});

test('unpaid, unknown, missing, refunded and disputed payment states fail closed', () => {
  for (const paymentStatus of ['pending', 'authorized', 'failed', 'refunded', 'partially_refunded', 'chargeback', 'unknown', '', null, undefined]) {
    assert.equal(canClientSeeMeetingDetails({ bookingStatus: 'confirmed', paymentStatus }), false);
    assert.equal(clientMeetingDetailsAfterPayment(booking, { payment_status: paymentStatus }), null);
  }
});

test('missing payment record or booking fails closed', () => {
  assert.equal(clientMeetingDetailsAfterPayment(booking, null), null);
  assert.equal(clientMeetingDetailsAfterPayment(null, { payment_status: 'paid' }), null);
});

test('payment status matching is case insensitive and trims whitespace', () => {
  assert.equal(canClientSeeMeetingDetails({ bookingStatus: 'confirmed', paymentStatus: ' PAID ' }), true);
});

test('meeting links must be HTTPS and cannot embed credentials', () => {
  for (const meeting_join_url of ['javascript:alert(1)', 'http://meet.example.test', 'https://user:pass@meet.example.test']) {
    assert.equal(clientMeetingDetailsAfterPayment({ ...booking, meeting_join_url }, { payment_status: 'paid' })?.joinUrl, null);
  }
});
