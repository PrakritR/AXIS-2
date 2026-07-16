import "server-only";

import { filterAdminUserIds } from "@/lib/auth/admin-role";
import type { SupabaseClient } from "@supabase/supabase-js";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function payloadSlots(rowData: unknown): string[] {
  if (!rowData || typeof rowData !== "object" || Array.isArray(rowData)) return [];
  const payload = (rowData as Record<string, unknown>).payload;
  return Array.isArray(payload) ? payload.filter((item): item is string => typeof item === "string") : [];
}

/** True when the manager owns the property or has property-scoped availability for it. */
export async function managerMayHostPropertyTour(
  db: SupabaseClient,
  input: { managerUserId: string; propertyId: string },
): Promise<boolean> {
  const managerUserId = input.managerUserId.trim();
  const propertyId = input.propertyId.trim();
  if (!managerUserId || !propertyId) return false;

  const { data: propertyRow } = await db
    .from("manager_property_records")
    .select("manager_user_id, status")
    .eq("id", propertyId)
    .maybeSingle();

  if (propertyRow?.status?.trim().toLowerCase() === "live" && text(propertyRow.manager_user_id) === managerUserId) {
    return true;
  }

  const { data: availabilityRows } = await db
    .from("portal_schedule_records")
    .select("manager_user_id, property_id, record_type")
    .eq("manager_user_id", managerUserId)
    .in("record_type", ["manager_property_availability", "manager_availability"]);

  for (const row of availabilityRows ?? []) {
    if (text(row.manager_user_id) !== managerUserId) continue;
    const rowPropertyId = text(row.property_id);
    if (row.record_type === "manager_property_availability" && rowPropertyId === propertyId) return true;
    if (row.record_type === "manager_availability" && propertyRow && text(propertyRow.manager_user_id) === managerUserId) {
      return true;
    }
  }

  return false;
}

/** True when slotKey appears in the manager's published availability rows. */
export async function managerHasPublishedSlot(
  db: SupabaseClient,
  input: { managerUserId: string; slotKey: string; propertyId?: string | null },
): Promise<boolean> {
  const managerUserId = input.managerUserId.trim();
  const slotKey = input.slotKey.trim();
  const propertyId = input.propertyId?.trim() ?? "";
  if (!managerUserId || !slotKey) return false;

  const { data: rows } = await db
    .from("portal_schedule_records")
    .select("property_id, record_type, row_data")
    .eq("manager_user_id", managerUserId)
    .in("record_type", ["manager_property_availability", "manager_availability"]);

  for (const row of rows ?? []) {
    if (propertyId && row.record_type === "manager_property_availability" && text(row.property_id) !== propertyId) {
      continue;
    }
    if (payloadSlots(row.row_data).includes(slotKey)) return true;
  }
  return false;
}

/** True when an admin-role account publishes the slot in admin availability. */
export async function adminHasPublishedSlot(
  db: SupabaseClient,
  input: { adminUserId: string; slotKey: string },
): Promise<boolean> {
  const adminUserId = input.adminUserId.trim();
  const slotKey = input.slotKey.trim();
  if (!adminUserId || !slotKey) return false;

  const adminIds = await filterAdminUserIds(db, [adminUserId]);
  if (!adminIds.has(adminUserId)) return false;

  const { data: rows } = await db
    .from("portal_schedule_records")
    .select("row_data")
    .eq("record_type", "admin_availability");

  for (const row of rows ?? []) {
    if (payloadSlots(row.row_data).includes(slotKey)) return true;
  }
  return false;
}
