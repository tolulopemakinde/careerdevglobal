type SupabaseClientLike = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: any; error: any }>;
  functions: { invoke(name: string, options: { body: Record<string, unknown> }): Promise<{ data: any; error: any }> };
};
export function runCareerDiscoveryDraft(supabase: SupabaseClientLike, payload: Record<string, unknown>): Promise<Record<string, any>>;
