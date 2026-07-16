/**
 * Vendor-directory ownership resolution shared by the work-order API routes and
 * the agent tool layer. A vendorId (manager_vendor_records.id) is only usable by
 * a manager when the row belongs to them or the owning manager marked it shared —
 * the same gate the work-order-vendor-offers route applies — so a crafted
 * vendorId can never attach an uninvited/other-manager's vendor to a work order.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type OwnedVendorDirectoryRow = {
  /** The vendor's linked auth user, once they've signed up (null before). */
  vendorUserId: string | null;
  name: string;
  trade: string;
  email: string;
};

/**
 * Resolve a vendor directory row the given manager is allowed to use (their own
 * row, or another manager's row marked sharedWithManagers). `rejected: true`
 * means the id exists outside the manager's reach (or not at all) and the write
 * must be refused — never silently treated as "no vendor".
 */
export async function resolveOwnedVendor(
  db: SupabaseClient,
  vendorId: string | null | undefined,
  ownerManagerUserId: string | null,
): Promise<{ vendor: OwnedVendorDirectoryRow | null; rejected: boolean }> {
  const id = vendorId?.trim();
  if (!id) return { vendor: null, rejected: false };
  const { data } = await db
    .from("manager_vendor_records")
    .select("manager_user_id, vendor_user_id, row_data")
    .eq("id", id)
    .maybeSingle();
  if (!data) return { vendor: null, rejected: true };
  const rowData = (data.row_data ?? {}) as Record<string, unknown>;
  const shared = rowData.sharedWithManagers === true;
  const owned = Boolean(ownerManagerUserId) && (data.manager_user_id === ownerManagerUserId || shared);
  if (!owned) return { vendor: null, rejected: true };
  return {
    vendor: {
      vendorUserId: (data.vendor_user_id as string | null) ?? null,
      name: String(rowData.name ?? ""),
      trade: String(rowData.trade ?? ""),
      email: String(rowData.email ?? "").trim().toLowerCase(),
    },
    rejected: false,
  };
}

/** Resolve a vendor directory row's linked auth user, so the record can be scoped
 * for the vendor's own GET query and inbox notifications without a join at read time.
 * Rejects (returns `rejected: true`) a vendorId that doesn't belong to `ownerManagerUserId`
 * and isn't marked shared — so a client can't attach an uninvited/other-manager's vendor
 * to a work order via a crafted vendorId. */
export async function resolveVendorUserId(
  db: SupabaseClient,
  vendorId: string | null | undefined,
  ownerManagerUserId: string | null,
): Promise<{ vendorUserId: string | null; rejected: boolean }> {
  const { vendor, rejected } = await resolveOwnedVendor(db, vendorId, ownerManagerUserId);
  return { vendorUserId: vendor?.vendorUserId ?? null, rejected };
}
