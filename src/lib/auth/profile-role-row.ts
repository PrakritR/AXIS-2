import type { SupabaseClient } from "@supabase/supabase-js";

/** Keeps profile_roles in sync when profiles are written (service or self). */
export async function ensureProfileRoleRow(
  supabase: SupabaseClient,
  userId: string,
  role: "resident" | "manager" | "owner" | "admin",
) {
  const { error } = await supabase.from("profile_roles").upsert(
    { user_id: userId, role },
    { onConflict: "user_id,role" },
  );
  if (error) throw error;
}
