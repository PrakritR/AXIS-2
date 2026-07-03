/**
 * Demo: which listings / property ids a signed-in portal user may see for Applications, filters, etc.
 */

import type { DemoApplicantRow } from "@/data/demo-portal";
import type { MockProperty } from "@/data/types";
import {
  PROPERTY_PIPELINE_EVENT,
  readAllExtraListings,
  readAllPendingManagerProperties,
  readExtraListingsForUser,
  readPendingManagerPropertiesForUser,
  syncPropertyPipelineFromServer,
  buildMockPropertyFromDraft,
} from "@/lib/demo-property-pipeline";
import { MANAGER_APPLICATIONS_EVENT, readManagerApplicationRows } from "@/lib/manager-applications-storage";
import { readProRelationships, syncProRelationshipsFromServer } from "@/lib/pro-relationships";
import { hasCoManagerPermission, hasCoManagerPermissionForProperty } from "@/lib/co-manager-permissions";

/** Property ids explicitly assigned via accepted co-manager account links. */
export function collectLinkedPropertyIds(userId: string): Set<string> {
  const s = new Set<string>();
  for (const rel of readProRelationships(userId)) {
    for (const id of rel.assignedPropertyIds) {
      if (id.trim()) s.add(id.trim());
    }
  }
  return s;
}

/** Property ids from this user's listings plus pending rows and account-link assignments. */
export function collectAccessiblePropertyIds(userId: string): Set<string> {
  const s = new Set<string>();
  for (const p of readExtraListingsForUser(userId)) s.add(p.id);
  for (const r of readPendingManagerPropertiesForUser(userId)) s.add(r.id);
  for (const id of collectLinkedPropertyIds(userId)) s.add(id);
  return s;
}

/** Refresh co-manager relationships and property pipeline (includes linked owner listings). */
export async function syncManagerPortfolioFromServer(userId: string, opts?: { force?: boolean }): Promise<void> {
  if (!userId.trim()) return;
  try {
    await syncProRelationshipsFromServer(userId, { force: opts?.force === true });
    await syncPropertyPipelineFromServer({ force: opts?.force === true });
  } catch {
    /* offline or dev server recompiling */
  }
}

/** Whether an application row should appear for this portal user. */
export function applicationVisibleToPortalUser(row: DemoApplicantRow, userId: string | null): boolean {
  if (!userId) return false;
  if (row.managerUserId && row.managerUserId === userId) return true;
  const pid = row.assignedPropertyId?.trim() || row.propertyId?.trim() || row.application?.propertyId?.trim();
  if (pid && collectAccessiblePropertyIds(userId).has(pid)) return true;
  return false;
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
  if (pid && collectAccessiblePropertyIds(userId).has(pid)) return true;
  return false;
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

/** Labels for Applications / Payments property dropdowns. */
export function buildManagerPropertyFilterOptions(userId: string | null): ManagerPropertyFilterOption[] {
  if (!userId) return [];
  const labelById = new Map<string, string>();

  for (const p of readExtraListingsForUser(userId)) {
    labelById.set(p.id, safePropertyOptionLabel([p.title, p.buildingName, p.address], p.id));
  }
  for (const r of readPendingManagerPropertiesForUser(userId)) {
    const joined = [r.buildingName, r.address].filter(Boolean).join(" · ");
    labelById.set(r.id, safePropertyOptionLabel([joined, r.buildingName, r.address], r.id));
  }

  const allExtras = readAllExtraListings();
  for (const rel of readProRelationships(userId)) {
    for (const pid of rel.assignedPropertyIds) {
      if (!pid.trim() || labelById.has(pid)) continue;
      const found = allExtras.find((x) => x.id === pid);
      labelById.set(pid, safePropertyOptionLabel([found?.title, found?.buildingName, found?.address], pid));
    }
  }

  for (const row of readManagerApplicationRows()) {
    if (!applicationVisibleToPortalUser(row, userId)) continue;
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
    const fromExtras = allListings.find((l) => l.id === pid);
    if (fromExtras) {
      const ownerUserId = fromExtras.managerUserId?.trim() ?? "";
      return ownerUserId ? { listing: fromExtras, ownerUserId } : null;
    }
    const pending = readAllPendingManagerProperties().find((p) => p.id === pid);
    if (pending) {
      const ownerUserId = pending.submittedByUserId?.trim() ?? "";
      if (!ownerUserId) return null;
      return { listing: buildMockPropertyFromDraft(pending, pid), ownerUserId };
    }
    return null;
  };

  for (const rel of readProRelationships(userId)) {
    for (const pid of rel.assignedPropertyIds) {
      if (seen.has(pid)) continue;
      const resolved = resolveListing(pid);
      if (!resolved) continue;
      const { listing, ownerUserId } = resolved;
      if (ownerUserId === userId) continue;
      seen.add(pid);
      result.push({
        listing,
        canEdit:
          hasCoManagerPermissionForProperty(rel.propertyCoManagerPermissions, pid, "editListings") ||
          hasCoManagerPermission(rel.coManagerPermissions, "editListings") ||
          rel.canEditListing === true,
        ownerUserId,
      });
    }
  }
  return result;
}

export const MANAGER_PORTFOLIO_REFRESH_EVENTS = [
  PROPERTY_PIPELINE_EVENT,
  "axis-pro-relationships",
  "storage",
  MANAGER_APPLICATIONS_EVENT,
] as const;
