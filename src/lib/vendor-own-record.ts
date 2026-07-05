import type { SupabaseClient } from "@supabase/supabase-js";
import type { ManagerVendorRow } from "@/lib/manager-vendors-storage";

/** Most recently updated vendor directory row for a signed-in vendor user. */
export async function resolveOwnVendorRecord(
  db: SupabaseClient,
  userId: string,
): Promise<{ id: string; managerUserId: string; row: ManagerVendorRow } | null> {
  const { data, error } = await db
    .from("manager_vendor_records")
    .select("id, manager_user_id, row_data, updated_at")
    .eq("vendor_user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id as string,
    managerUserId: data.manager_user_id as string,
    row: data.row_data as ManagerVendorRow,
  };
}
