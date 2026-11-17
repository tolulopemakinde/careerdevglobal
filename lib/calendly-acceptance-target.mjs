export function calendlyOperationMode(projectRef, backendUrl) {
  if (!projectRef) return 'legacy';
  if (!/^[a-z0-9]{20}$/.test(projectRef) || ['ufmhrmzumqkjvaezrmxf', 'yyevuwvtrktrzwuzeddo'].includes(projectRef) ||
      backendUrl !== `https://${projectRef}.supabase.co`) return 'blocked';
  return 'acceptance';
}
export async function runAcceptanceBooking(client, bookingId, kind) {
  const { data, error } = await client.functions.invoke('careerdev-calendly-operations', { body: { booking_id: bookingId, kind } });
  // Unknown outcomes never fall back to the legacy provider POST or database RPC.
  if (error || data?.state !== 'succeeded') return { status: 'review', message: 'This booking needs reconciliation. Do not repeat the action.' };
  return { status: 'success', message: kind === 'confirm' ? 'Booking confirmed.' : 'Booking cancelled. Payment and refund handling are separate.' };
}
