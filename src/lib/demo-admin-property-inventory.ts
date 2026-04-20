import type { MockProperty } from "@/data/types";
import {
  appendExtraListing,
  buildMockPropertyFromAdminRow,
  buildMockPropertyFromDraft,
  LEGACY_MANAGER_SCOPE_USER_ID,
  PROPERTY_PIPELINE_EVENT,
  readAllExtraListings,
  readAllPendingManagerProperties,
  readExtraListingsForUser,
  readPendingManagerPropertiesForUser,
  removeExtraListing,
  submitManagerPendingProperty,
  takePendingManagerProperty,
  type ManagerPendingPropertyRow,
} from "@/lib/demo-property-pipeline";
import { legacyAdminFieldsToSubmission } from "@/lib/manager-listing-submission";

/** Admin-wide queue (all managers). Manager portal passes `forManagerUserId` for isolated side-buckets. */
const SIDE_KEY_GLOBAL = "axis_admin_property_buckets_v1";

function sideKey(forManagerUserId?: string | null): string {
  if (forManagerUserId) return `axis_mgr_property_side_v1_${forManagerUserId}`;
  return SIDE_KEY_GLOBAL;
}

export type AdminPropertyBucketIndex = 0 | 1 | 2 | 3 | 4;

export type AdminPropertyRow = {
  adminRefId: string;
  buildingName: string;
  unitLabel: string;
  address: string;
  zip: string;
  neighborhood: string;
  beds: number;
  baths: number;
  monthlyRent: number;
  petFriendly: boolean;
  tagline: string;
  listingId?: string;
  /** Owning manager (Supabase user id) for scoped demo data. */
  managerUserId?: string;
};

type SideBuckets = {
  requestChange: AdminPropertyRow[];
  unlisted: AdminPropertyRow[];
  rejected: AdminPropertyRow[];
};

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readJson<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeSideStorage(side: SideBuckets, forManagerUserId?: string | null) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(sideKey(forManagerUserId), JSON.stringify(side));
    window.dispatchEvent(new Event(PROPERTY_PIPELINE_EVENT));
  } catch {
    /* ignore */
  }
}

function readSide(forManagerUserId?: string | null): SideBuckets {
  return readJson<SideBuckets>(sideKey(forManagerUserId), { requestChange: [], unlisted: [], rejected: [] });
}

function slugPart(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

function newAdminRefId() {
  return `adm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function pendingToAdminRow(row: ManagerPendingPropertyRow): AdminPropertyRow {
  return {
    adminRefId: row.id,
    buildingName: row.buildingName,
    unitLabel: row.unitLabel,
    address: row.address,
    zip: row.zip,
    neighborhood: row.neighborhood,
    beds: row.beds,
    baths: row.baths,
    monthlyRent: row.monthlyRent,
    petFriendly: row.petFriendly,
    tagline: row.tagline,
    managerUserId: row.submittedByUserId,
  };
}

/** Preview mock for portal “More details” — same shape as public listing page. */
export function resolveAdminPropertyRowPreview(row: AdminPropertyRow): MockProperty {
  const pending = readAllPendingManagerProperties().find((p) => p.id === row.adminRefId);
  if (pending) {
    return buildMockPropertyFromDraft(pending, row.listingId ?? `preview-${pending.id}`);
  }
  if (row.listingId) {
    const hit = readAllExtraListings().find((p) => p.id === row.listingId);
    if (hit) return hit;
  }
  return buildMockPropertyFromAdminRow(row, row.listingId ?? `preview-${row.adminRefId}`);
}

/** Public listing URL when the row is live on Rent with Axis (not a draft preview id). */
export function publicListingHrefForPropertyRow(row: AdminPropertyRow): string | null {
  const id = row.listingId;
  if (!id || id.startsWith("preview-") || id.startsWith("demo-")) return null;
  return `/rent/listings/${id}`;
}

export function mockToAdminRow(prop: MockProperty, listingId: string): AdminPropertyRow {
  const rentNum = Number(String(prop.rentLabel).replace(/[^\d.]/g, "")) || 0;
  return {
    adminRefId: listingId,
    buildingName: prop.buildingName,
    unitLabel: prop.unitLabel,
    address: prop.address,
    zip: prop.zip,
    neighborhood: prop.neighborhood,
    beds: prop.beds,
    baths: prop.baths,
    monthlyRent: rentNum,
    petFriendly: prop.petFriendly,
    tagline: prop.tagline,
    listingId,
    managerUserId: prop.managerUserId,
  };
}

/** When `forManagerUserId` is set, counts only that manager’s pipeline + side buckets (manager portal). */
export function adminKpiCounts(forManagerUserId?: string | null): [number, number, number, number, number] {
  if (forManagerUserId) {
    const pending = readPendingManagerPropertiesForUser(forManagerUserId).length;
    const side = readSide(forManagerUserId);
    const listed = readExtraListingsForUser(forManagerUserId).filter((p) => p.id.startsWith("mgr-")).length;
    return [pending, side.requestChange.length, listed, side.unlisted.length, side.rejected.length];
  }
  const pending = readAllPendingManagerProperties().length;
  const side = readSide();
  const listed = readAllExtraListings().filter((p) => p.id.startsWith("mgr-")).length;
  return [pending, side.requestChange.length, listed, side.unlisted.length, side.rejected.length];
}

export function readAdminPropertyRows(
  bucket: AdminPropertyBucketIndex,
  forManagerUserId?: string | null,
): AdminPropertyRow[] {
  const side = readSide(forManagerUserId);
  if (bucket === 0) {
    const pendingSource = forManagerUserId
      ? readPendingManagerPropertiesForUser(forManagerUserId)
      : readAllPendingManagerProperties();
    return pendingSource.map(pendingToAdminRow);
  }
  if (bucket === 1) return side.requestChange;
  if (bucket === 2) {
    const extras = forManagerUserId ? readExtraListingsForUser(forManagerUserId) : readAllExtraListings();
    return extras.filter((p) => p.id.startsWith("mgr-")).map((p) => mockToAdminRow(p, p.id));
  }
  if (bucket === 3) return side.unlisted;
  return side.rejected;
}

export function movePendingToRequestChange(pendingId: string, forManagerUserId?: string | null): boolean {
  const row = takePendingManagerProperty(pendingId);
  if (!row) return false;
  const side = readSide(forManagerUserId);
  side.requestChange.push(pendingToAdminRow(row));
  writeSideStorage(side, forManagerUserId);
  return true;
}

export function movePendingToRejected(pendingId: string, forManagerUserId?: string | null): boolean {
  const row = takePendingManagerProperty(pendingId);
  if (!row) return false;
  const side = readSide(forManagerUserId);
  side.rejected.push({ ...pendingToAdminRow(row), adminRefId: newAdminRefId() });
  writeSideStorage(side, forManagerUserId);
  return true;
}

export function approveFromRequestChange(adminRefId: string, forManagerUserId?: string | null): boolean {
  const side = readSide(forManagerUserId);
  const idx = side.requestChange.findIndex((r) => r.adminRefId === adminRefId);
  if (idx === -1) return false;
  const row = side.requestChange[idx]!;
  const nextRc = [...side.requestChange.slice(0, idx), ...side.requestChange.slice(idx + 1)];
  const listingId = `mgr-${slugPart(row.buildingName)}-${slugPart(row.unitLabel)}-${adminRefId.slice(-6)}`;
  const prop = buildMockPropertyFromAdminRow(row, listingId);
  const owner = row.managerUserId ?? LEGACY_MANAGER_SCOPE_USER_ID;
  appendExtraListing({ ...prop, managerUserId: owner }, owner);
  writeSideStorage({ ...side, requestChange: nextRc }, forManagerUserId);
  return true;
}

export function declineFromRequestChange(adminRefId: string, forManagerUserId?: string | null): boolean {
  const side = readSide(forManagerUserId);
  const idx = side.requestChange.findIndex((r) => r.adminRefId === adminRefId);
  if (idx === -1) return false;
  const row = side.requestChange[idx]!;
  const nextRc = [...side.requestChange.slice(0, idx), ...side.requestChange.slice(idx + 1)];
  side.rejected.push({ ...row, adminRefId: newAdminRefId() });
  writeSideStorage({ ...side, requestChange: nextRc }, forManagerUserId);
  return true;
}

export function returnRequestChangeToPending(adminRefId: string, forManagerUserId?: string | null): boolean {
  const side = readSide(forManagerUserId);
  const idx = side.requestChange.findIndex((r) => r.adminRefId === adminRefId);
  if (idx === -1) return false;
  const row = side.requestChange[idx]!;
  const nextRc = [...side.requestChange.slice(0, idx), ...side.requestChange.slice(idx + 1)];
  const uid = row.managerUserId ?? forManagerUserId ?? LEGACY_MANAGER_SCOPE_USER_ID;
  submitManagerPendingProperty(legacyAdminFieldsToSubmission(row), uid);
  writeSideStorage({ ...side, requestChange: nextRc }, forManagerUserId);
  return true;
}

export function unlistManagerListing(listingId: string, forManagerUserId?: string | null): boolean {
  const removed = removeExtraListing(listingId);
  if (!removed) return false;
  const side = readSide(forManagerUserId);
  side.unlisted.push(mockToAdminRow(removed, listingId));
  writeSideStorage(side, forManagerUserId);
  return true;
}

export function listAdminRow(row: AdminPropertyRow, forManagerUserId?: string | null): string | null {
  const side = readSide(forManagerUserId);
  const idx = side.unlisted.findIndex((r) => r.adminRefId === row.adminRefId);
  if (idx === -1) return null;
  const listingId =
    row.listingId ?? `mgr-${slugPart(row.buildingName)}-${slugPart(row.unitLabel)}-${row.adminRefId.slice(-6)}`;
  const prop = buildMockPropertyFromAdminRow(row, listingId);
  const owner = row.managerUserId ?? forManagerUserId ?? LEGACY_MANAGER_SCOPE_USER_ID;
  appendExtraListing({ ...prop, managerUserId: owner }, owner);
  const nextUn = [...side.unlisted.slice(0, idx), ...side.unlisted.slice(idx + 1)];
  writeSideStorage({ ...side, unlisted: nextUn }, forManagerUserId);
  return listingId;
}

export function moveListedToRequestChange(listingId: string, forManagerUserId?: string | null): boolean {
  const removed = removeExtraListing(listingId);
  if (!removed) return false;
  const side = readSide(forManagerUserId);
  side.requestChange.push(mockToAdminRow(removed, listingId));
  writeSideStorage(side, forManagerUserId);
  return true;
}

export function moveListedToRejected(listingId: string, forManagerUserId?: string | null): boolean {
  const removed = removeExtraListing(listingId);
  if (!removed) return false;
  const side = readSide(forManagerUserId);
  side.rejected.push({ ...mockToAdminRow(removed, listingId), adminRefId: newAdminRefId() });
  writeSideStorage(side, forManagerUserId);
  return true;
}

export function moveUnlistedToRejected(adminRefId: string, forManagerUserId?: string | null): boolean {
  const side = readSide(forManagerUserId);
  const idx = side.unlisted.findIndex((r) => r.adminRefId === adminRefId);
  if (idx === -1) return false;
  const row = side.unlisted[idx]!;
  const next = [...side.unlisted.slice(0, idx), ...side.unlisted.slice(idx + 1)];
  side.rejected.push({ ...row, adminRefId: newAdminRefId() });
  writeSideStorage({ ...side, unlisted: next }, forManagerUserId);
  return true;
}

export function restoreRejectedToPending(adminRefId: string, forManagerUserId?: string | null): boolean {
  const side = readSide(forManagerUserId);
  const idx = side.rejected.findIndex((r) => r.adminRefId === adminRefId);
  if (idx === -1) return false;
  const row = side.rejected[idx]!;
  const nextR = [...side.rejected.slice(0, idx), ...side.rejected.slice(idx + 1)];
  const uid = row.managerUserId ?? forManagerUserId ?? LEGACY_MANAGER_SCOPE_USER_ID;
  submitManagerPendingProperty(legacyAdminFieldsToSubmission(row), uid);
  writeSideStorage({ ...side, rejected: nextR }, forManagerUserId);
  return true;
}
