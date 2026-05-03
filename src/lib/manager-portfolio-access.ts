/**
 * Demo: which listings / property ids a signed-in portal user may see for Applications, filters, etc.
 */

import type { DemoApplicantRow } from "@/data/demo-portal";
import type { MockProperty } from "@/data/types";
import {
  PROPERTY_PIPELINE_EVENT,
  readAllExtraListings,
  readExtraListingsForUser,
  readPendingManagerPropertiesForUser,
} from "@/lib/demo-property-pipeline";
import { MANAGER_APPLICATIONS_EVENT, readManagerApplicationRows } from "@/lib/manager-applications-storage";
import { readProRelationships } from "@/lib/pro-relationships";

/** Property ids from this user's listings plus pending rows and account-link assignments. */
export function collectAccessiblePropertyIds(userId: string): Set<string> {
  const s = new Set<string>();
  for (const p of readExtraListingsForUser(userId)) s.add(p.id);
  for (const r of readPendingManagerPropertiesForUser(userId)) s.add(r.id);
  for (const rel of readProRelationships(userId)) {
    for (const id of rel.assignedPropertyIds) {
      if (id.trim()) s.add(id);
    }
  }
  return s;
}

/** Whether an application row should appear for this portal user. */
export function applicationVisibleToPortalUser(row: DemoApplicantRow, userId: string | null): boolean {
  if (!userId) return false;
  if (row.managerUserId && row.managerUserId === userId) return true;
  const pid = row.assignedPropertyId?.trim() || row.propertyId?.trim() || row.application?.propertyId?.trim();
  if (pid && collectAccessiblePropertyIds(userId).has(pid)) return true;
  return false;
}

export type ManagerPropertyFilterOption = { id: string; label: string };

/** Labels for Applications / Payments property dropdowns. */
export function buildManagerPropertyFilterOptions(userId: string | null): ManagerPropertyFilterOption[] {
  if (!userId) return [];
  const labelById = new Map<string, string>();

  for (const p of readExtraListingsForUser(userId)) {
    labelById.set(p.id, (p.title || p.buildingName || p.address).trim() || p.id);
  }
  for (const r of readPendingManagerPropertiesForUser(userId)) {
    const label = [r.buildingName, r.address].filter(Boolean).join(" · ").trim() || r.id;
    labelById.set(r.id, label);
  }

  const allExtras = readAllExtraListings();
  for (const rel of readProRelationships(userId)) {
    for (const pid of rel.assignedPropertyIds) {
      if (!pid.trim() || labelById.has(pid)) continue;
      const found = allExtras.find((x) => x.id === pid);
      labelById.set(pid, found ? (found.title || found.address).trim() || pid : pid);
    }
  }

  for (const row of readManagerApplicationRows()) {
    if (!applicationVisibleToPortalUser(row, userId)) continue;
    const pid = row.assignedPropertyId?.trim() || row.propertyId?.trim() || row.application?.propertyId?.trim();
    if (pid && !labelById.has(pid)) {
      labelById.set(pid, row.property.trim() || pid);
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
  for (const rel of readProRelationships(userId)) {
    for (const pid of rel.assignedPropertyIds) {
      if (seen.has(pid)) continue;
      const listing = allListings.find((l) => l.id === pid);
      if (!listing) continue;
      const ownerUserId = listing.managerUserId?.trim() ?? "";
      if (!ownerUserId || ownerUserId === userId) continue;
      seen.add(pid);
      result.push({ listing, canEdit: rel.canEditListing === true, ownerUserId });
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
