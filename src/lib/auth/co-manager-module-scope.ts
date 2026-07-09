import "server-only";

import { collectLinkedPropertyPermissionsForUser } from "@/lib/auth/manager-lease-scope";
import {
  hasCoManagerPermissionForProperty,
  normalizePropertyCoManagerPermissions,
  permissionsForProperty,
  type CoManagerPermissionId,
} from "@/lib/co-manager-permissions";
import { isCrossSandboxPortalPair } from "@/lib/portal-sandbox-accounts";
import type { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

type ServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;

/**
 * Module-access rule for co-manager links: assigning a property IS the grant —
 * a link whose permissions object is empty gives the co-manager every module
 * on that property. When the owner has checked specific modules in the
 * permissions editor, the set becomes a RESTRICTION to those modules.
 * (Without this default, every pre-editor link would grant nothing and the
 * feature would look broken — see AGENTS co-manager notes.)
 */
function moduleAllowed(
  propertyPerms: ReturnType<typeof normalizePropertyCoManagerPermissions> | undefined,
  propertyId: string,
  module: CoManagerPermissionId,
): boolean {
  const flat = permissionsForProperty(propertyPerms, propertyId);
  const anyGranted = Object.values(flat).some(Boolean);
  if (!anyGranted) return true;
  return hasCoManagerPermissionForProperty(propertyPerms, propertyId, module);
}

/** Linked property ids on which this user (as an accepted co-manager) may use `module`. */
export async function linkedPropertyIdsForModule(
  db: ServiceClient,
  userId: string,
  module: CoManagerPermissionId,
): Promise<Set<string>> {
  const byProperty = await collectLinkedPropertyPermissionsForUser(db, userId);
  const out = new Set<string>();
  for (const [propertyId] of byProperty) {
    if (moduleAllowed(byProperty.get(propertyId), propertyId, module)) out.add(propertyId);
  }
  return out;
}

export type LinkedOwnerScope = {
  /** Owner (inviter) manager user ids where this user has `module` access on ≥1 assigned property. */
  ownerIds: Set<string>;
  /** Property ids (across all owners) where `module` is allowed. */
  propertyIds: Set<string>;
};

/**
 * Owner-level scope for owner-keyed tables (e.g. the vendor directory, which
 * has no property column): a co-manager with `module` access on at least one
 * of an owner's assigned properties may read that owner's rows for the module.
 * Sandbox↔real account pairs are excluded, mirroring collectLinkedPropertyIdsForUser.
 */
export async function linkedOwnerScopeForModule(
  db: ServiceClient,
  userId: string,
  module: CoManagerPermissionId,
): Promise<LinkedOwnerScope> {
  const ownerIds = new Set<string>();
  const propertyIds = new Set<string>();
  try {
    const { data: viewerProfile } = await db.from("profiles").select("email").eq("id", userId).maybeSingle();
    const viewerEmail = String(viewerProfile?.email ?? "").trim();

    const { data: linkRows, error } = await db
      .from("account_link_invites")
      .select("inviter_user_id, assigned_property_ids, property_co_manager_permissions, co_manager_permissions")
      .eq("status", "accepted")
      .eq("invitee_user_id", userId);
    if (error) return { ownerIds, propertyIds };

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
      if (!inviterId) continue;
      if (isCrossSandboxPortalPair(viewerEmail, inviterEmailById.get(inviterId) ?? "")) continue;

      const assignedRaw = (row as { assigned_property_ids?: unknown }).assigned_property_ids;
      const assigned = Array.isArray(assignedRaw)
        ? assignedRaw.filter((id): id is string => typeof id === "string" && Boolean(id.trim())).map((id) => id.trim())
        : [];
      if (assigned.length === 0) continue;

      const perms = normalizePropertyCoManagerPermissions(
        (row as { property_co_manager_permissions?: unknown }).property_co_manager_permissions ??
          (row as { co_manager_permissions?: unknown }).co_manager_permissions,
        assigned,
      );

      let ownerQualifies = false;
      for (const propertyId of assigned) {
        if (moduleAllowed(perms, propertyId, module)) {
          propertyIds.add(propertyId);
          ownerQualifies = true;
        }
      }
      if (ownerQualifies) ownerIds.add(inviterId);
    }
  } catch {
    /* table may not exist */
  }
  return { ownerIds, propertyIds };
}

/**
 * Merge owned rows with linked-property rows for a `row_data`-shaped table.
 * `propertyColumns` are checked in order via `.in(column, ids)` queries; rows
 * are deduped by id with owned rows winning.
 */
export async function fetchRowsForManagerWithLinked<T extends { id: string }>(
  db: ServiceClient,
  table: string,
  userId: string,
  linkedPropertyIds: Set<string>,
  opts?: { select?: string; propertyColumns?: string[]; limit?: number },
): Promise<T[]> {
  const select = opts?.select ?? "id, row_data, updated_at";
  const propertyColumns = opts?.propertyColumns ?? ["property_id"];
  const limit = opts?.limit ?? 500;

  const { data: ownedRows, error: ownedError } = await db
    .from(table)
    .select(select)
    .eq("manager_user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (ownedError) throw ownedError;

  const byId = new Map<string, T>();
  for (const row of (ownedRows ?? []) as unknown as T[]) {
    if (row.id) byId.set(row.id, row);
  }

  if (linkedPropertyIds.size > 0) {
    const ids = [...linkedPropertyIds];
    for (const column of propertyColumns) {
      const { data: linkedRows, error: linkedError } = await db
        .from(table)
        .select(select)
        .in(column, ids)
        .order("updated_at", { ascending: false })
        .limit(limit);
      if (linkedError) {
        // Column may not exist on this table — skip rather than fail the request.
        continue;
      }
      for (const row of (linkedRows ?? []) as unknown as T[]) {
        if (row.id && !byId.has(row.id)) byId.set(row.id, row);
      }
    }
  }

  return [...byId.values()];
}
