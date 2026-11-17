export function calendlyOperationMode(projectRef: string | undefined, backendUrl: string | undefined): 'legacy' | 'blocked' | 'acceptance';
export type AcceptanceFunctionClient = {
  functions: {
    invoke(name: string, options: { body: { booking_id: string; kind: 'confirm' | 'cancel' } }): PromiseLike<{ data: unknown; error: unknown }>;
  };
};
export function runAcceptanceBooking(client: AcceptanceFunctionClient, bookingId: string, kind: 'confirm' | 'cancel'): Promise<{ status: 'success' | 'review'; message: string }>;
