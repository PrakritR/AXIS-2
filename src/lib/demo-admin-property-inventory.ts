import type { MockProperty } from "@/data/types";
import {
  PROPERTY_PIPELINE_EVENT,
  appendExtraListing,
  approvePendingManagerProperty,
  buildMockPropertyFromAdminRow,
  readExtraListings,
  readPendingManagerProperties,
  removeExtraListing,
  submitManagerPendingProperty,
  takePendingManagerProperty,
  type ManagerPendingPropertyRow,
} from "@/lib/demo-property-pipeline";
import { legacyAdminFieldsToSubmission } from "@/lib/manager-listing-submission";

const SIDE_KEY = "axis_admin_property_buckets_v1";

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

function writeSide(side: SideBuckets) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(SIDE_KEY, JSON.stringify(side));
    window.dispatchEvent(new Event(PROPERTY_PIPELINE_EVENT));
  } catch {
    /* ignore */
  }
}

function readSide(): SideBuckets {
  return readJson<SideBuckets>(SIDE_KEY, { requestChange: [], unlisted: [], rejected: [] });
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
  };
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
  };
}

export function adminKpiCounts(): [number, number, number, number, number] {
  const pending = readPendingManagerProperties().length;
  const side = readSide();
  const listed = readExtraListings().filter((p) => p.id.startsWith("mgr-")).length;
  return [pending, side.requestChange.length, listed, side.unlisted.length, side.rejected.length];
}

export function readAdminPropertyRows(bucket: AdminPropertyBucketIndex): AdminPropertyRow[] {
  const side = readSide();
  if (bucket === 0) {
    return readPendingManagerProperties().map(pendingToAdminRow);
  }
  if (bucket === 1) return side.requestChange;
  if (bucket === 2) {
    return readExtraListings()
      .filter((p) => p.id.startsWith("mgr-"))
      .map((p) => mockToAdminRow(p, p.id));
  }
  if (bucket === 3) return side.unlisted;
  return side.rejected;
}

export function movePendingToRequestChange(pendingId: string): boolean {
  const row = takePendingManagerProperty(pendingId);
  if (!row) return false;
  const side = readSide();
  side.requestChange.push(pendingToAdminRow(row));
  writeSide(side);
  return true;
}

export function movePendingToRejected(pendingId: string): boolean {
  const row = takePendingManagerProperty(pendingId);
  if (!row) return false;
  const side = readSide();
  side.rejected.push({ ...pendingToAdminRow(row), adminRefId: newAdminRefId() });
  writeSide(side);
  return true;
}

export function approveFromRequestChange(adminRefId: string): boolean {
  const side = readSide();
  const idx = side.requestChange.findIndex((r) => r.adminRefId === adminRefId);
  if (idx === -1) return false;
  const row = side.requestChange[idx]!;
  const nextRc = [...side.requestChange.slice(0, idx), ...side.requestChange.slice(idx + 1)];
  const listingId = `mgr-${slugPart(row.buildingName)}-${slugPart(row.unitLabel)}-${adminRefId.slice(-6)}`;
  const prop = buildMockPropertyFromAdminRow(row, listingId);
  appendExtraListing(prop);
  writeSide({ ...side, requestChange: nextRc });
  return true;
}

export function declineFromRequestChange(adminRefId: string): boolean {
  const side = readSide();
  const idx = side.requestChange.findIndex((r) => r.adminRefId === adminRefId);
  if (idx === -1) return false;
  const row = side.requestChange[idx]!;
  const nextRc = [...side.requestChange.slice(0, idx), ...side.requestChange.slice(idx + 1)];
  side.rejected.push({ ...row, adminRefId: newAdminRefId() });
  writeSide({ ...side, requestChange: nextRc });
  return true;
}

export function returnRequestChangeToPending(adminRefId: string): boolean {
  const side = readSide();
  const idx = side.requestChange.findIndex((r) => r.adminRefId === adminRefId);
  if (idx === -1) return false;
  const row = side.requestChange[idx]!;
  const nextRc = [...side.requestChange.slice(0, idx), ...side.requestChange.slice(idx + 1)];
  submitManagerPendingProperty(legacyAdminFieldsToSubmission(row));
  writeSide({ ...side, requestChange: nextRc });
  return true;
}

export function unlistManagerListing(listingId: string): boolean {
  const removed = removeExtraListing(listingId);
  if (!removed) return false;
  const side = readSide();
  side.unlisted.push(mockToAdminRow(removed, listingId));
  writeSide(side);
  return true;
}

export function listAdminRow(row: AdminPropertyRow): string | null {
  const side = readSide();
  const idx = side.unlisted.findIndex((r) => r.adminRefId === row.adminRefId);
  if (idx === -1) return null;
  const listingId =
    row.listingId ?? `mgr-${slugPart(row.buildingName)}-${slugPart(row.unitLabel)}-${row.adminRefId.slice(-6)}`;
  const prop = buildMockPropertyFromAdminRow(row, listingId);
  appendExtraListing(prop);
  const nextUn = [...side.unlisted.slice(0, idx), ...side.unlisted.slice(idx + 1)];
  writeSide({ ...side, unlisted: nextUn });
  return listingId;
}

export function moveListedToRequestChange(listingId: string): boolean {
  const removed = removeExtraListing(listingId);
  if (!removed) return false;
  const side = readSide();
  side.requestChange.push(mockToAdminRow(removed, listingId));
  writeSide(side);
  return true;
}

export function moveListedToRejected(listingId: string): boolean {
  const removed = removeExtraListing(listingId);
  if (!removed) return false;
  const side = readSide();
  side.rejected.push({ ...mockToAdminRow(removed, listingId), adminRefId: newAdminRefId() });
  writeSide(side);
  return true;
}

export function moveUnlistedToRejected(adminRefId: string): boolean {
  const side = readSide();
  const idx = side.unlisted.findIndex((r) => r.adminRefId === adminRefId);
  if (idx === -1) return false;
  const row = side.unlisted[idx]!;
  const next = [...side.unlisted.slice(0, idx), ...side.unlisted.slice(idx + 1)];
  side.rejected.push({ ...row, adminRefId: newAdminRefId() });
  writeSide({ ...side, unlisted: next });
  return true;
}

export function restoreRejectedToPending(adminRefId: string): boolean {
  const side = readSide();
  const idx = side.rejected.findIndex((r) => r.adminRefId === adminRefId);
  if (idx === -1) return false;
  const row = side.rejected[idx]!;
  const nextR = [...side.rejected.slice(0, idx), ...side.rejected.slice(idx + 1)];
  submitManagerPendingProperty(legacyAdminFieldsToSubmission(row));
  writeSide({ ...side, rejected: nextR });
  return true;
}
