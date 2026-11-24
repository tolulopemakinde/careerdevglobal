export function createExecutiveReview(input?: Record<string, any>, generatedAt?: string): Record<string, any>;
export function executiveReviewToMarkdown(review: Record<string, any>): string;
type SupabaseClientLike = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: any; error: any }>;
  functions: { invoke(name: string, options: { body: unknown }): Promise<{ data: any; error: any }> };
};
export function runCEOOperationsDraft(supabase: SupabaseClientLike, payload: Record<string, unknown>): Promise<Record<string, any>>;
export function requestCEOIndependentReview(supabase: SupabaseClientLike, result: { requestId: string; executionId: string }): Promise<unknown>;
