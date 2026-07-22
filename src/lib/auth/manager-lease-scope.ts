import "server-only";

import { asStringArray, readPropertyPermissionsFromRow } from "@/app/api/pro/account-links/route";
import {
  hasCoManagerPermissionLevelForProperty,
  permissionsForProperty,
  type CoManagerPermissionId,
  type CoManagerPermissionLevel,
  type PropertyCoManagerPermissions,
} from "@/lib/co-manager-permissions";
import { isCrossSandboxPortalPair } from "@/lib/portal-sandbox-accounts";
import type { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

type ServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;

export type LeaseScopeRecord = {
  id: string;
  manager_user_id?: string | null;
  property_id?: string | null;
  resident_email?: string | null;
  row_data?: unknown;
};

/** Property ids assigned via accepted incoming co-manager links for this user. */
export async function collectLinkedPropertyIdsForUser(db: ServiceClient, userId: string): Promise<Set<string>> {
  const linkedPropertyIds = new Set<string>();
  try {
    const { data: viewerProfile } = await db.from("profiles").select("email").eq("id", userId).maybeSingle();
    const viewerEmail = String(viewerProfile?.email ?? "").trim();

    const { data: linkRows, error } = await db
      .from("account_link_invites")
      .select("inviter_user_id, assigned_property_ids")
      .eq("status", "accepted")
      .eq("invitee_user_id", userId);
    if (error && !String(error.message ?? "").toLowerCase().includes("account_link_invites")) {
      return linkedPropertyIds;
    }

    const inviterIds = [
      ...new Set(
        (linkRows ?? [])
          .map((row) => String((row as { inviter_user_id?: string }).inviter_user_id ?? "").trim())
          .filter(Boolean),
      ),
    ];
    const inviterEmailById = new Map<string, string>();
    if (inviterIds.length > 0) {
      const { data: profiles } = await db.from("profiles").select("id, email").in("id", inviterIds);
      for (const profile of profiles ?? []) {
        const id = String(profile.id ?? "").trim();
        const email = String(profile.email ?? "").trim();
        if (id && email) inviterEmailById.set(id, email);
      }
    }

    for (const row of linkRows ?? []) {
      const inviterId = String((row as { inviter_user_id?: string }).inviter_user_id ?? "").trim();
      if (isCrossSandboxPortalPair(viewerEmail, inviterEmailById.get(inviterId) ?? "")) continue;
      if (!Array.isArray((row as { assigned_property_ids?: unknown }).assigned_property_ids)) continue;
      for (const id of (row as { assigned_property_ids: unknown[] }).assigned_property_ids) {
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
  level: CoManagerPermissionLevel = "read",
): Promise<boolean> {
  const { data: propertyRow } = await db
    .from("manager_property_records")
    .select("manager_user_id")
    .eq("id", propertyId)
    .maybeSingle();
  if (propertyRow?.manager_user_id === userId) return true;

  const linked = await collectLinkedPropertyPermissionsForUser(db, userId);
  if (!linked.has(propertyId)) return false;
  const perms = linked.get(propertyId);
  // Same default as co-manager-module-scope: an assignment with NO checked
  // permissions grants every module at every level; a non-empty set restricts.
  const flat = permissionsForProperty(perms, propertyId);
  if (Object.keys(flat).length === 0) return true;
  return hasCoManagerPermissionLevelForProperty(perms, propertyId, permission, level);
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

/**
 * Linked property ids on which this user holds the `leases` grant (empty perms =
 * full access). Implemented locally — reuses collectLinkedPropertyIdsForUser (for
 * the cross-sandbox-filtered membership) and collectLinkedPropertyPermissionsForUser
 * (for the per-property grant) — to avoid importing co-manager-module-scope, which
 * imports this file (cycle). This is the SERVER gate that keeps lease PDF bytes out
 * of a co-manager's GET response when they lack the leases grant.
 */
async function linkedLeasePropertyIds(db: ServiceClient, userId: string): Promise<Set<string>> {
  const [membership, permsByProperty] = await Promise.all([
    collectLinkedPropertyIdsForUser(db, userId),
    collectLinkedPropertyPermissionsForUser(db, userId),
  ]);
  const out = new Set<string>();
  for (const pid of membership) {
    const perms = permsByProperty.get(pid);
    const flat = permissionsForProperty(perms, pid);
    if (Object.keys(flat).length === 0 || hasCoManagerPermissionLevelForProperty(perms, pid, "leases", "read")) {
      out.add(pid);
    }
  }
  return out;
}

/** Fetch lease pipeline records visible to a manager (own rows + leases-granted linked rows). */
export async function fetchLeasesForManagerUser(
  db: ServiceClient,
  // property_id + manager_user_id are required so leaseRecordVisibleToManager can
  // authorize LINKED rows — without property_id the visibility re-check always
  // failed and linked-property leases were silently dropped from the response.
  userId: string,
  select = "id, row_data, updated_at, manager_user_id, property_id",
  limit = 500,
): Promise<LeaseScopeRecord[]> {
  const linkedPropertyIds = await linkedLeasePropertyIds(db, userId);

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

/**
 * Whether the user may access this lease record. `level` defaults to read
 * (any linked property qualifies); pass "edit"/"delete" on write paths so the
 * co-manager's granular leases grant is enforced.
 */
export async function managerCanAccessLeaseRecord(
  db: ServiceClient,
  userId: string,
  record: Pick<LeaseScopeRecord, "manager_user_id" | "property_id">,
  level: CoManagerPermissionLevel = "read",
): Promise<boolean> {
  if (record.manager_user_id === userId) return true;
  const propertyId = record.property_id?.trim() || "";
  if (!propertyId) return false;
  // Read too is now gated by the `leases` grant (was linked-membership only), so a
  // co-manager without leases can neither list nor open another owner's lease.
  return managerHasCoManagerPermissionForProperty(db, userId, propertyId, "leases", level);
}
