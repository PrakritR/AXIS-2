import type { SupabaseClient } from "@supabase/supabase-js";

/** Service-role client only (`auth.admin`). */
export async function findAuthUserIdByEmail(supabase: SupabaseClient, email: string): Promise<string | null> {
  const normal = email.trim().toLowerCase();
  // Fast path: check profiles table (populated for all provisioned accounts).
  const { data: profileRow } = await supabase.from("profiles").select("id").eq("email", normal).maybeSingle();
  if (profileRow?.id) return profileRow.id as string;
  // Fallback: scan auth users for accounts that were created but haven't had a profile upserted yet.
  const { data: listData, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error || !listData?.users?.length) return null;
  const u = listData.users.find((x) => x.email?.toLowerCase() === normal);
  return u?.id ?? null;
}
