/**
 * Demo: which listings / property ids a signed-in portal user may see for Applications, filters, etc.
 */

import type { DemoApplicantRow } from "@/data/demo-portal";
import type { MockProperty } from "@/data/types";
import { resolveManagerScopeUserId } from "@/lib/demo/demo-session";
import {
  PROPERTY_PIPELINE_EVENT,
  readAllExtraListings,
  readAllPendingManagerProperties,
  readExtraListingsForUser,
  readPendingManagerPropertiesForUser,
  readScopedExtraListings,
  syncPropertyPipelineFromServer,
  buildMockPropertyFromDraft,
} from "@/lib/demo-property-pipeline";
import { MANAGER_APPLICATIONS_EVENT, readManagerApplicationRows } from "@/lib/manager-applications-storage";
import { readProRelationships, syncProRelationshipsFromServer } from "@/lib/pro-relationships";
import { readCachedAccountLinkInvites } from "@/lib/portal-data-store";
import {
  hasCoManagerPermission,
  hasCoManagerPermissionForProperty,
  hasCoManagerPermissionLevelForProperty,
  permissionsForProperty,
  type CoManagerPermissionId,
  type CoManagerPermissionLevel,
  type PropertyCoManagerPermissions,
} from "@/lib/co-manager-permissions";

/** Match property ids across minor formatting differences (avoid importing calendar — cycle). */
function samePropertyId(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = String(a ?? "").trim();
  const right = String(b ?? "").trim();
  if (!left || !right) return false;
  if (left === right) return true;
  const token = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  return token(left) === token(right);
}

export function ownedPropertyIdsForUser(userId: string): Set<string> {
  const owned = new Set<string>();
  for (const p of readExtraListingsForUser(userId)) owned.add(p.id);
  for (const r of readPendingManagerPropertiesForUser(userId)) owned.add(r.id);
  return owned;
}

function addIncomingAssignedPropertyIds(userId: string, target: Set<string>): void {
  const owned = ownedPropertyIdsForUser(userId);
  for (const rel of readProRelationships(userId)) {
    if (rel.linkDirection === "outgoing") continue;
    for (const id of rel.assignedPropertyIds) {
      const pid = id.trim();
      if (pid && !owned.has(pid)) target.add(pid);
    }
  }
  for (const inv of readCachedAccountLinkInvites()) {
    if (inv.status !== "accepted" || inv.direction !== "incoming") continue;
    for (const id of inv.assignedPropertyIds) {
      const pid = id.trim();
      if (pid && !owned.has(pid)) target.add(pid);
    }
  }
}

/** Property ids explicitly assigned via accepted co-manager account links. */
export function collectLinkedPropertyIds(userId: string): Set<string> {
  const s = new Set<string>();
  addIncomingAssignedPropertyIds(userId, s);
  return s;
}

/**
 * Client mirror of the server's module rule (src/lib/auth/co-manager-module-scope.ts):
 * an assigned property with NO module permissions checked grants every module;
 * a non-empty permission set restricts access to the checked modules.
 */
function modulePermsAllow(
  perms: PropertyCoManagerPermissions | undefined,
  propertyId: string,
  module: CoManagerPermissionId,
): boolean {
  const flat = permissionsForProperty(perms, propertyId);
  const anyGranted = Object.values(flat).some(Boolean);
  if (!anyGranted) return true;
  return hasCoManagerPermissionForProperty(perms, propertyId, module);
}

/** Linked property ids where this user may use `module` (client-side view of accepted links). */
export function collectLinkedPropertyIdsForModule(userId: string, module: CoManagerPermissionId): Set<string> {
  const owned = ownedPropertyIdsForUser(userId);
  const out = new Set<string>();
  for (const rel of readProRelationships(userId)) {
    if (rel.linkDirection === "outgoing") continue;
    for (const id of rel.assignedPropertyIds) {
      const pid = id.trim();
      if (!pid || owned.has(pid)) continue;
      if (modulePermsAllow(rel.propertyCoManagerPermissions, pid, module)) out.add(pid);
    }
  }
  for (const inv of readCachedAccountLinkInvites()) {
    if (inv.status !== "accepted" || inv.direction !== "incoming") continue;
    for (const id of inv.assignedPropertyIds) {
      const pid = id.trim();
      if (!pid || owned.has(pid)) continue;
      if (modulePermsAllow(inv.propertyCoManagerPermissions, pid, module)) out.add(pid);
    }
  }
  return out;
}

/** Linked OWNER manager user ids where this user has `module` access on ≥1 assigned property. */
export function collectLinkedOwnerIdsForModule(userId: string, module: CoManagerPermissionId): Set<string> {
  const out = new Set<string>();
  if (!userId) return out;
  for (const inv of readCachedAccountLinkInvites()) {
    if (inv.status !== "accepted" || inv.direction !== "incoming") continue;
    const ownerId = inv.linkedUserId?.trim();
    if (!ownerId || ownerId === userId) continue;
    const qualifies = inv.assignedPropertyIds.some((id) => {
      const pid = id.trim();
      return pid && modulePermsAllow(inv.propertyCoManagerPermissions, pid, module);
    });
    if (qualifies) out.add(ownerId);
  }
  return out;
}

/** Client mirror of modulePermsAllow but at a specific level (edit/delete). Empty perms = full access. */
function modulePermsAllowLevel(
  perms: PropertyCoManagerPermissions | undefined,
  propertyId: string,
  module: CoManagerPermissionId,
  level: CoManagerPermissionLevel,
): boolean {
  const flat = permissionsForProperty(perms, propertyId);
  const anyGranted = Object.values(flat).some(Boolean);
  if (!anyGranted) return true;
  return hasCoManagerPermissionLevelForProperty(perms, propertyId, module, level);
}

/**
 * Whether this user may use `module` at `level` (edit/delete) on a linked property.
 * Own properties always qualify. Used to gate destructive/edit actions that the
 * read-only `collectLinkedPropertyIdsForModule` set does not distinguish.
 */
export function hasLinkedPropertyModuleLevel(
  userId: string,
  propertyId: string,
  module: CoManagerPermissionId,
  level: CoManagerPermissionLevel,
): boolean {
  const pid = propertyId.trim();
  if (!userId || !pid) return false;
  if (ownedPropertyIdsForUser(userId).has(pid)) return true;
  for (const rel of readProRelationships(userId)) {
    if (rel.linkDirection === "outgoing") continue;
    if (!rel.assignedPropertyIds.some((id) => id.trim() === pid)) continue;
    if (modulePermsAllowLevel(rel.propertyCoManagerPermissions, pid, module, level)) return true;
  }
  for (const inv of readCachedAccountLinkInvites()) {
    if (inv.status !== "accepted" || inv.direction !== "incoming") continue;
    if (!inv.assignedPropertyIds.some((id) => id.trim() === pid)) continue;
    if (modulePermsAllowLevel(inv.propertyCoManagerPermissions, pid, module, level)) return true;
  }
  return false;
}

/** The OWNER (primary manager) user id for a linked property, or null if it's the user's own / not linked. */
export function linkedPropertyOwnerId(userId: string, propertyId: string): string | null {
  const pid = propertyId.trim();
  if (!userId || !pid) return null;
  if (ownedPropertyIdsForUser(userId).has(pid)) return null;
  for (const inv of readCachedAccountLinkInvites()) {
    if (inv.status !== "accepted" || inv.direction !== "incoming") continue;
    if (!inv.assignedPropertyIds.some((id) => id.trim() === pid)) continue;
    const owner = inv.linkedUserId?.trim();
    if (owner && owner !== userId) return owner;
  }
  for (const rel of readProRelationships(userId)) {
    if (rel.linkDirection === "outgoing") continue;
    if (!rel.assignedPropertyIds.some((id) => id.trim() === pid)) continue;
    const owner = (rel as { linkedUserId?: string | null }).linkedUserId?.trim();
    if (owner && owner !== userId) return owner;
  }
  return null;
}

/** Whether a row scoped by managerUserId/propertyId is visible for a module (owner or linked co-manager). */
export function moduleRowVisibleToPortalUser(
  row: { managerUserId?: string | null; propertyId?: string | null; assignedPropertyId?: string | null },
  userId: string | null,
  module: CoManagerPermissionId,
): boolean {
  if (!userId) return false;
  if (!row.managerUserId || row.managerUserId === userId) return true;
  const linked = collectLinkedPropertyIdsForModule(userId, module);
  const pid = row.propertyId?.trim();
  const apid = row.assignedPropertyId?.trim();
  return Boolean((pid && linked.has(pid)) || (apid && linked.has(apid)));
}

/** Refresh co-manager relationships and property pipeline (includes linked owner listings). */
export async function syncManagerPortfolioFromServer(userId: string, opts?: { force?: boolean }): Promise<void> {
  if (!userId.trim()) return;
  try {
    await syncProRelationshipsFromServer(userId, { force: opts?.force === true });
    const linkedPropertyIds = collectLinkedPropertyIds(userId);
    await syncPropertyPipelineFromServer({
      force: opts?.force === true,
      userId,
      linkedPropertyIds,
    });
  } catch {
    /* offline or dev server recompiling */
  }
}

/**
 * Whether an application/resident row should appear for this portal user.
 *
 * Pass `module` to gate a co-manager's LINKED-property rows by a specific grant
 * (e.g. "residents" for the Residents tab, "applications" for Applications) so a
 * co-manager granted only, say, `payments` on a property no longer sees its
 * residents. Omitting `module` keeps the legacy module-agnostic behavior (any
 * assigned property is visible) for callers that aren't module-scoped yet.
 * Owned/pending properties are always visible regardless of `module`.
 */
export function applicationVisibleToPortalUser(
  row: DemoApplicantRow,
  userId: string | null,
  module?: CoManagerPermissionId,
): boolean {
  if (!userId) return false;
  if (row.managerUserId && row.managerUserId === userId) return true;
  const pid = row.assignedPropertyId?.trim() || row.propertyId?.trim() || row.application?.propertyId?.trim();
  if (!pid) return false;
  if (ownedPropertyIdsForUser(userId).has(pid)) return true;
  const linked = module ? collectLinkedPropertyIdsForModule(userId, module) : collectLinkedPropertyIds(userId);
  return linked.has(pid);
}

/** Minimal lease shape for portfolio visibility checks (avoids circular imports). */
export type LeaseVisibilityRow = {
  managerUserId?: string | null;
  propertyId?: string;
  application?: { propertyId?: string };
};

/** Whether a lease row should appear for this portal user (direct owner or linked property). */
export function leaseVisibleToPortalUser(row: LeaseVisibilityRow, userId: string | null): boolean {
  if (!userId) return false;
  if (row.managerUserId && row.managerUserId === userId) return true;
  const pid = row.propertyId?.trim() || row.application?.propertyId?.trim();
  if (!pid) return false;
  if (ownedPropertyIdsForUser(userId).has(pid)) return true;
  // Gate a linked owner's leases by the `leases` module grant (empty perms = full).
  return collectLinkedPropertyIdsForModule(userId, "leases").has(pid);
}

export type ManagerPropertyFilterOption = { id: string; label: string };

/**
 * True when a label is really a raw property id / seed-run token rather than a
 * human name — e.g. `test-prop-seed-1782590281847` or a title like
 * "Seed Property seed-1782590281847" left behind by an older seed. These must
 * never reach a user-facing dropdown.
 */
function looksLikeRawPropertyId(value: string, id: string): boolean {
  const v = value.trim();
  if (!v) return true;
  if (v === id.trim()) return true;
  return /(?:^|[\s(])(?:seed|test)[-_]prop\b|\bseed-\d{6,}\b|\bseedwf[_-]|\bmgr-[a-z0-9]{4,}-[a-z0-9]{4,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-|\d{12,}/i.test(v);
}

/**
 * First human-friendly candidate that is not a raw id / seed token. Falls back
 * to any non-id candidate, then a generic label — never the bare id. Shared by
 * every property picker so labels stay consistent and clean across surfaces.
 */
export function safePropertyOptionLabel(candidates: Array<string | null | undefined>, id: string): string {
  for (const c of candidates) {
    const v = (c ?? "").trim();
    if (v && !looksLikeRawPropertyId(v, id)) return v;
  }
  for (const c of candidates) {
    const v = (c ?? "").trim();
    if (v && v !== id.trim()) return v;
  }
  return "Untitled property";
}

/** Human-readable label for a property id across owned, linked, and pending pipeline rows. */
export function resolvePropertyLabelForId(id: string, fallback?: string): string {
  const pid = id.trim();
  if (!pid) return fallback?.trim() || "Untitled property";
  const fromExtras = readAllExtraListings().find((p) => p.id === pid);
  if (fromExtras) {
    return safePropertyOptionLabel(
      [fromExtras.buildingName, fromExtras.unitLabel, fromExtras.title, fromExtras.address],
      pid,
    );
  }
  const pending = readAllPendingManagerProperties().find((p) => p.id === pid);
  if (pending) {
    const joined = [pending.buildingName, pending.unitLabel, pending.address].filter(Boolean).join(" · ");
    return safePropertyOptionLabel([joined, pending.buildingName, pending.address], pid);
  }
  return safePropertyOptionLabel([fallback], pid);
}

/** Labels for Applications / Payments property dropdowns. */
export function buildManagerPropertyFilterOptions(userId: string | null): ManagerPropertyFilterOption[] {
  const scopeUserId = resolveManagerScopeUserId(userId);
  if (!scopeUserId) return [];
  const labelById = new Map<string, string>();

  for (const p of readScopedExtraListings(scopeUserId)) {
    labelById.set(p.id, safePropertyOptionLabel([p.title, p.buildingName, p.address], p.id));
  }
  for (const r of readPendingManagerPropertiesForUser(scopeUserId)) {
    const joined = [r.buildingName, r.address].filter(Boolean).join(" · ");
    labelById.set(r.id, safePropertyOptionLabel([joined, r.buildingName, r.address], r.id));
  }

  const allExtras = readAllExtraListings();
  for (const rel of readProRelationships(scopeUserId)) {
    for (const pid of rel.assignedPropertyIds) {
      if (!pid.trim() || labelById.has(pid)) continue;
      const found = allExtras.find((x) => x.id === pid);
      const pending = readAllPendingManagerProperties().find((x) => x.id === pid);
      const pendingJoined = pending
        ? [pending.buildingName, pending.unitLabel, pending.address].filter(Boolean).join(" · ")
        : undefined;
      labelById.set(
        pid,
        safePropertyOptionLabel([found?.title, found?.buildingName, pendingJoined, found?.address], pid),
      );
    }
  }

  for (const pid of collectLinkedPropertyIds(scopeUserId)) {
    if (labelById.has(pid)) continue;
    const found = allExtras.find((x) => x.id === pid);
    const pending = readAllPendingManagerProperties().find((x) => x.id === pid);
    const pendingJoined = pending
      ? [pending.buildingName, pending.unitLabel, pending.address].filter(Boolean).join(" · ")
      : undefined;
    labelById.set(
      pid,
      safePropertyOptionLabel([found?.title, found?.buildingName, pendingJoined, found?.address], pid),
    );
  }

  for (const row of readManagerApplicationRows()) {
    if (!applicationVisibleToPortalUser(row, scopeUserId)) continue;
    const pid = row.assignedPropertyId?.trim() || row.propertyId?.trim() || row.application?.propertyId?.trim();
    if (pid && !labelById.has(pid)) {
      labelById.set(pid, safePropertyOptionLabel([row.property], pid));
    }
  }

  return [...labelById.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

/** Listings from linked accounts that this user has been given access to. */
export function readLinkedListingsForUser(userId: string): { listing: MockProperty; canEdit: boolean; ownerUserId: string }[] {
  const allListings = readAllExtraListings();
  const seen = new Set<string>();
  const result: { listing: MockProperty; canEdit: boolean; ownerUserId: string }[] = [];

  const resolveListing = (pid: string): { listing: MockProperty; ownerUserId: string } | null => {
    const fromExtras = allListings.find((l) => samePropertyId(l.id, pid));
    if (fromExtras) {
      const ownerUserId = fromExtras.managerUserId?.trim() ?? "";
      return ownerUserId ? { listing: fromExtras, ownerUserId } : null;
    }
    const pending = readAllPendingManagerProperties().find((p) => samePropertyId(p.id, pid));
    if (pending) {
      const ownerUserId = pending.submittedByUserId?.trim() ?? "";
      if (!ownerUserId) return null;
      return { listing: buildMockPropertyFromDraft(pending, pending.id), ownerUserId };
    }
    return null;
  };

  const permissionsForPropertyId = (pid: string): PropertyCoManagerPermissions[string] | undefined => {
    for (const rel of readProRelationships(userId)) {
      if (rel.linkDirection === "outgoing") continue;
      if (!rel.assignedPropertyIds.some((id) => samePropertyId(id, pid))) continue;
      return permissionsForProperty(rel.propertyCoManagerPermissions, pid);
    }
    for (const inv of readCachedAccountLinkInvites()) {
      if (inv.status !== "accepted" || inv.direction !== "incoming") continue;
      if (!inv.assignedPropertyIds.some((id) => samePropertyId(id, pid))) continue;
      return permissionsForProperty(inv.propertyCoManagerPermissions, pid);
    }
    return undefined;
  };

  for (const pid of collectLinkedPropertyIds(userId)) {
    if (seen.has(pid)) continue;
    const resolved = resolveListing(pid);
    if (!resolved) continue;
    const { listing, ownerUserId } = resolved;
    if (ownerUserId === userId) continue;
    seen.add(pid);
    const perms = permissionsForPropertyId(pid);
    const rel = readProRelationships(userId).find(
      (row) => row.linkDirection !== "outgoing" && row.assignedPropertyIds.some((id) => samePropertyId(id, pid)),
    );
    result.push({
      listing,
      canEdit:
        hasCoManagerPermissionForProperty(rel?.propertyCoManagerPermissions, pid, "properties") ||
        hasCoManagerPermission(perms, "properties") ||
        hasCoManagerPermission(rel?.coManagerPermissions, "properties") ||
        rel?.canEditListing === true,
      ownerUserId,
    });
  }
  return result;
}

export const MANAGER_PORTFOLIO_REFRESH_EVENTS = [
  PROPERTY_PIPELINE_EVENT,
  "axis-pro-relationships",
  "storage",
  MANAGER_APPLICATIONS_EVENT,
] as const;
