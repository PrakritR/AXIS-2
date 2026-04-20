import type { SupabaseClient } from "@supabase/supabase-js";

/** Service-role client only (`auth.admin`). */
export async function findAuthUserIdByEmail(supabase: SupabaseClient, email: string): Promise<string | null> {
  const normal = email.trim().toLowerCase();
  const { data: listData, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error || !listData?.users?.length) return null;
  const u = listData.users.find((x) => x.email?.toLowerCase() === normal);
  return u?.id ?? null;
}
