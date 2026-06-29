import "server-only";

import { asStringArray, readPropertyPermissionsFromRow } from "@/app/api/pro/account-links/route";
import {
  hasCoManagerPermissionForProperty,
  type CoManagerPermissionId,
  type PropertyCoManagerPermissions,
} from "@/lib/co-manager-permissions";
import type { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

type ServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;

export type LeaseScopeRecord = {
  id: string;
  manager_user_id?: string | null;
  property_id?: string | null;
  resident_email?: string | null;
  row_data?: unknown;
};

/** Property ids assigned via accepted account_link_invites for this user. */
export async function collectLinkedPropertyIdsForUser(db: ServiceClient, userId: string): Promise<Set<string>> {
  const linkedPropertyIds = new Set<string>();
  try {
    const { data: linkRows, error } = await db
      .from("account_link_invites")
      .select("assigned_property_ids")
      .eq("status", "accepted")
      .or(`inviter_user_id.eq.${userId},invitee_user_id.eq.${userId}`);
    if (error && !String(error.message ?? "").toLowerCase().includes("account_link_invites")) {
      return linkedPropertyIds;
    }
    for (const row of (linkRows ?? []) as { assigned_property_ids?: unknown }[]) {
      if (!Array.isArray(row.assigned_property_ids)) continue;
      for (const id of row.assigned_property_ids) {
        if (typeof id === "string" && id.trim()) linkedPropertyIds.add(id.trim());
      }
    }
  } catch {
    /* table may not exist */
  }
  return linkedPropertyIds;
}

/** Per-property co-manager permissions for incoming accepted links. */
export async function collectLinkedPropertyPermissionsForUser(
  db: ServiceClient,
  userId: string,
): Promise<Map<string, PropertyCoManagerPermissions>> {
  const byProperty = new Map<string, PropertyCoManagerPermissions>();
  try {
    const { data: linkRows, error } = await db
      .from("account_link_invites")
      .select("inviter_user_id, invitee_user_id, assigned_property_ids, property_co_manager_permissions, co_manager_permissions")
      .eq("status", "accepted")
      .eq("invitee_user_id", userId);
    if (error && !String(error.message ?? "").toLowerCase().includes("account_link_invites")) {
      return byProperty;
    }
    for (const row of linkRows ?? []) {
      const assigned = asStringArray((row as { assigned_property_ids?: unknown }).assigned_property_ids);
      const perms = readPropertyPermissionsFromRow(row as Parameters<typeof readPropertyPermissionsFromRow>[0]);
      for (const propertyId of assigned) {
        const existing = byProperty.get(propertyId) ?? {};
        byProperty.set(propertyId, {
          ...existing,
          ...perms,
          [propertyId]: perms[propertyId] ?? {},
        });
      }
    }
  } catch {
    /* table may not exist */
  }
  return byProperty;
}

export async function managerHasCoManagerPermissionForProperty(
  db: ServiceClient,
  userId: string,
  propertyId: string,
  permission: CoManagerPermissionId,
): Promise<boolean> {
  const { data: propertyRow } = await db
    .from("manager_property_records")
    .select("manager_user_id")
    .eq("id", propertyId)
    .maybeSingle();
  if (propertyRow?.manager_user_id === userId) return true;

  const linked = await collectLinkedPropertyPermissionsForUser(db, userId);
  const perms = linked.get(propertyId);
  return hasCoManagerPermissionForProperty(perms, propertyId, permission);
}

/** Primary owner or co-manager with calendar (or legacy properties) access on a property. */
export async function managerHasCalendarAccessForProperty(
  db: ServiceClient,
  userId: string,
  propertyId: string,
): Promise<boolean> {
  if (
    await managerHasCoManagerPermissionForProperty(db, userId, propertyId, "calendar")
  ) {
    return true;
  }
  return managerHasCoManagerPermissionForProperty(db, userId, propertyId, "properties");
}

export function leaseRecordVisibleToManager(
  record: Pick<LeaseScopeRecord, "manager_user_id" | "property_id">,
  userId: string,
  linkedPropertyIds: Set<string>,
): boolean {
  if (record.manager_user_id === userId) return true;
  const propertyId = record.property_id?.trim() || "";
  return Boolean(propertyId && linkedPropertyIds.has(propertyId));
}

/** Fetch lease pipeline records visible to a manager (own rows + linked-property rows). */
export async function fetchLeasesForManagerUser(
  db: ServiceClient,
  userId: string,
  select = "id, row_data, updated_at",
  limit = 500,
): Promise<LeaseScopeRecord[]> {
  const linkedPropertyIds = await collectLinkedPropertyIdsForUser(db, userId);

  const { data: ownedRows, error: ownedError } = await db
    .from("portal_lease_pipeline_records")
    .select(select)
    .eq("manager_user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (ownedError) throw ownedError;

  const byId = new Map<string, LeaseScopeRecord>();
  for (const row of (ownedRows ?? []) as unknown as LeaseScopeRecord[]) {
    if (row.id) byId.set(row.id, row);
  }

  if (linkedPropertyIds.size > 0) {
    const { data: linkedRows, error: linkedError } = await db
      .from("portal_lease_pipeline_records")
      .select(select)
      .in("property_id", [...linkedPropertyIds])
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (linkedError) throw linkedError;

    for (const row of (linkedRows ?? []) as unknown as LeaseScopeRecord[]) {
      if (!row.id || byId.has(row.id)) continue;
      if (leaseRecordVisibleToManager(row, userId, linkedPropertyIds)) {
        byId.set(row.id, row);
      }
    }
  }

  return [...byId.values()].sort((a, b) => {
    const aTs = Date.parse(String((a as { updated_at?: string }).updated_at ?? ""));
    const bTs = Date.parse(String((b as { updated_at?: string }).updated_at ?? ""));
    return (Number.isFinite(bTs) ? bTs : 0) - (Number.isFinite(aTs) ? aTs : 0);
  });
}

/** Returns true when the user may read or mutate this lease record. */
export async function managerCanAccessLeaseRecord(
  db: ServiceClient,
  userId: string,
  record: Pick<LeaseScopeRecord, "manager_user_id" | "property_id">,
): Promise<boolean> {
  const linkedPropertyIds = await collectLinkedPropertyIdsForUser(db, userId);
  return leaseRecordVisibleToManager(record, userId, linkedPropertyIds);
}
