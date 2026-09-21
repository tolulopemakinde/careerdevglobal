import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ufmhrmzumqkjvaezrmxf.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_8lIUCYbLzqp69RpZmE8ktA_56-doCVl",
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (items) => { try { items.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {} } } }
  );
}