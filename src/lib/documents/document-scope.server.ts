import type { SupabaseClient } from "@supabase/supabase-js";
import { UUID_PATTERN } from "@/lib/documents/manager-documents";

export async function managerOwnsVendorDirectoryRow(
  db: SupabaseClient,
  managerUserId: string,
  vendorId: string,
): Promise<boolean> {
  const { data } = await db
    .from("manager_vendor_records")
    .select("id")
    .eq("id", vendorId)
    .eq("manager_user_id", managerUserId)
    .maybeSingle();
  return Boolean(data?.id);
}

/** Resolve a resident auth user id from email when the manager shares by email only. */
export async function resolveResidentUserIdByEmail(
  db: SupabaseClient,
  email: string,
): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const { data } = await db.from("profiles").select("id").eq("email", normalized).maybeSingle();
  const id = data?.id ? String(data.id) : "";
  return id && UUID_PATTERN.test(id) ? id : null;
}
