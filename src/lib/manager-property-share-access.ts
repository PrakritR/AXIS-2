import "server-only";

import type { MockProperty } from "@/data/types";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

/**
 * Server-side authority check for sharing a listing to a prospect.
 *
 * Enforced against the Supabase source of truth (`manager_property_records`),
 * NEVER client-supplied data: a manager may share a property only when they own
 * it (`manager_user_id === userId`) or have been assigned it via an accepted
 * co-manager account link, AND the listing is live/active. Admins (platform
 * operators) may share any live listing — mirrors the property-records GET
 * admin scope. Returns the live property (from `property_data`) so callers can
 * build the invite from server-verified data, or `null` when not permitted.
 *
 * This replaces the client-storage-backed `managerCanSharePropertyForUser`,
 * whose reads are empty in a server (no localStorage) context.
 */
export async function getShareablePropertyForUser(
  userId: string | null | undefined,
  propertyId: string,
): Promise<MockProperty | null> {
  const uid = (userId ?? "").trim();
  const id = propertyId.trim();
  if (!uid || !id) return null;

  const db = createSupabaseServiceRoleClient();
  const { data: record, error } = await db
    .from("manager_property_records")
    .select("manager_user_id, status, property_data")
    .eq("id", id)
    .maybeSingle();
  if (error || !record) return null;

  const property = (record.property_data ?? null) as MockProperty | null;
  // Only active (live) listings are shareable — matches the manager UI's
  // `buildManagerShareablePropertyOptions` / `isPropertyActiveForLeads`.
  const isLive = record.status === "live" && property?.adminPublishLive === true;
  if (!isLive || !property) return null;

  // Direct owner of the listing.
  if (record.manager_user_id && record.manager_user_id === uid) return property;

  // Platform admin (mirrors the /api/property-records GET admin scope).
  if (await isAdminUser(uid)) return property;

  // Co-manager who was assigned this property via an accepted account link.
  const { data: linkRows } = await db
    .from("account_link_invites")
    .select("assigned_property_ids")
    .eq("status", "accepted")
    .or(`inviter_user_id.eq.${uid},invitee_user_id.eq.${uid}`);
  for (const row of (linkRows ?? []) as { assigned_property_ids?: unknown }[]) {
    if (!Array.isArray(row.assigned_property_ids)) continue;
    for (const pid of row.assigned_property_ids) {
      if (typeof pid === "string" && pid.trim() === id) return property;
    }
  }

  return null;
}
