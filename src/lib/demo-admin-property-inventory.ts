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
  republishManagerListingAfterReview,
  submitManagerPendingProperty,
  takePendingManagerProperty,
  type ManagerPendingPropertyRow,
} from "@/lib/demo-property-pipeline";
import { legacyAdminFieldsToSubmission, type ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";

/** Admin-wide queue (all managers). Manager portal passes `forManagerUserId` for isolated side-buckets. */
const SIDE_KEY_GLOBAL = "axis_admin_property_buckets_v1";

function sideKey(forManagerUserId?: string | null): string {
  if (forManagerUserId) return `axis_mgr_property_side_v1_${forManagerUserId}`;
  return SIDE_KEY_GLOBAL;
}

/** Admin-only moves (reject / decline). Managers must not invoke these from the portal UI. */
function adminListingRejectAllowed(): boolean {
  if (typeof window === "undefined") return true;
  return window.location.pathname.startsWith("/admin");
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
  /** Last admin “request edit” message shown to the submitting manager/owner (demo localStorage). */
  editRequestNote?: string;
  /** Full submission preserved so images and rich content survive the admin approval flow. */
  submission?: ManagerListingSubmissionV1;
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
  const raw = readJson<Partial<SideBuckets> | null>(sideKey(forManagerUserId), null);
  if (!raw || typeof raw !== "object") {
    return { requestChange: [], unlisted: [], rejected: [] };
  }
  return {
    requestChange: Array.isArray(raw.requestChange) ? raw.requestChange : [],
    unlisted: Array.isArray(raw.unlisted) ? raw.unlisted : [],
    rejected: Array.isArray(raw.rejected) ? raw.rejected : [],
  };
}

function slugPart(s: string | undefined | null) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

function newAdminRefId() {
  return `adm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Coerce partial / legacy localStorage rows so UI never calls `.trim()` on undefined. */
export function normalizeAdminPropertyRow(row: Partial<AdminPropertyRow> & { adminRefId?: string }): AdminPropertyRow {
  const str = (v: unknown) => String(v ?? "").trim();
  const n = (v: unknown, fallback = 0) => {
    const x = typeof v === "number" ? v : Number(v);
    return Number.isFinite(x) ? x : fallback;
  };
  const id = str(row.adminRefId);
  return {
    adminRefId: id || `adm-${Date.now()}`,
    buildingName: str(row.buildingName),
    unitLabel: str(row.unitLabel),
    address: str(row.address),
    zip: str(row.zip),
    neighborhood: str(row.neighborhood),
    beds: Math.max(0, Math.floor(n(row.beds, 1))),
    baths: Math.max(0, n(row.baths, 1)),
    monthlyRent: Math.max(0, n(row.monthlyRent, 0)),
    petFriendly: Boolean(row.petFriendly),
    tagline: str(row.tagline),
    listingId: row.listingId,
    managerUserId: row.managerUserId,
    editRequestNote: row.editRequestNote,
    submission: row.submission,
  };
}

export function pendingToAdminRow(row: ManagerPendingPropertyRow): AdminPropertyRow {
  return {
    ...normalizeAdminPropertyRow({
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
      tagline: row.tagline ?? "",
      managerUserId: row.submittedByUserId,
    }),
    submission: row.submission,
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
  const rentNum = Number(String(prop.rentLabel ?? "").replace(/[^\d.]/g, "")) || 0;
  return normalizeAdminPropertyRow({
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
    tagline: prop.tagline ?? "",
    listingId,
    managerUserId: prop.managerUserId,
    submission: prop.listingSubmission,
  });
}

/** When `forManagerUserId` is set, counts only that manager’s pipeline + side buckets (manager portal). */
export function adminKpiCounts(forManagerUserId?: string | null): [number, number, number, number, number] {
  try {
    if (forManagerUserId) {
      const extras = readExtraListingsForUser(forManagerUserId);
      const pending = readPendingManagerPropertiesForUser(forManagerUserId).length;
      const awaitingReapproval = extras.filter((p) => p?.id?.startsWith("mgr-") && p.adminPublishLive !== true).length;
      const side = readSide(forManagerUserId);
      const listed = extras.filter((p) => p?.id?.startsWith("mgr-") && p.adminPublishLive === true).length;
      return [pending + awaitingReapproval, side.requestChange.length, listed, side.unlisted.length, side.rejected.length];
    }
    const pending = readAllPendingManagerProperties().length;
    const awaitingReapproval = readAllExtraListings().filter(
      (p) => p?.id?.startsWith("mgr-") && p.adminPublishLive !== true,
    ).length;
    const side = readSide();
    const listed = readAllExtraListings().filter((p) => p?.id?.startsWith("mgr-") && p.adminPublishLive === true).length;
    return [pending + awaitingReapproval, side.requestChange.length, listed, side.unlisted.length, side.rejected.length];
  } catch {
    return [0, 0, 0, 0, 0];
  }
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
    const pendingRows = pendingSource.map(pendingToAdminRow);
    const awaitingExtras = forManagerUserId
      ? readExtraListingsForUser(forManagerUserId).filter((p) => p.id.startsWith("mgr-") && p.adminPublishLive !== true)
      : readAllExtraListings().filter((p) => p.id.startsWith("mgr-") && p.adminPublishLive !== true);
    const awaitingRows = awaitingExtras.map((p) => mockToAdminRow(p, p.id));
    return [...pendingRows, ...awaitingRows];
  }
  if (bucket === 1) return side.requestChange.map((r) => normalizeAdminPropertyRow(r));
  if (bucket === 2) {
    const extras = forManagerUserId ? readExtraListingsForUser(forManagerUserId) : readAllExtraListings();
    /** Must match {@link adminKpiCounts}: only catalog-live mgr listings. Edits set `adminPublishLive: false` until admin re-approves (see {@link updateExtraListingFromSubmission}). */
    const live = extras.filter((p) => p.id.startsWith("mgr-") && p.adminPublishLive === true);
    return live.map((p) => mockToAdminRow(p, p.id));
  }
  if (bucket === 3) return side.unlisted.map((r) => normalizeAdminPropertyRow(r));
  return side.rejected.map((r) => normalizeAdminPropertyRow(r));
}

export function movePendingToRequestChange(
  pendingId: string,
  forManagerUserId?: string | null,
  editRequestNote?: string,
): boolean {
  const row = takePendingManagerProperty(pendingId);
  if (!row) return false;
  const side = readSide(forManagerUserId);
  const note = editRequestNote?.trim();
  side.requestChange.push({
    ...pendingToAdminRow(row),
    ...(note ? { editRequestNote: note } : {}),
  });
  writeSideStorage(side, forManagerUserId);
  return true;
}

export function movePendingToRejected(pendingId: string, forManagerUserId?: string | null): boolean {
  if (!adminListingRejectAllowed()) return false;
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
  const prop = row.submission
    ? buildMockPropertyFromDraft({ ...row, id: listingId, submittedAt: new Date().toISOString(), submission: row.submission, submittedByUserId: row.managerUserId ?? LEGACY_MANAGER_SCOPE_USER_ID }, listingId)
    : buildMockPropertyFromAdminRow(row, listingId);
  const owner = row.managerUserId ?? LEGACY_MANAGER_SCOPE_USER_ID;
  appendExtraListing({ ...prop, managerUserId: owner, adminPublishLive: true }, owner);
  writeSideStorage({ ...side, requestChange: nextRc }, forManagerUserId);
  return true;
}

export function declineFromRequestChange(adminRefId: string, forManagerUserId?: string | null): boolean {
  if (!adminListingRejectAllowed()) return false;
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
  const owner = row.managerUserId ?? forManagerUserId ?? LEGACY_MANAGER_SCOPE_USER_ID;
  const prop = row.submission
    ? buildMockPropertyFromDraft({ ...row, id: listingId, submittedAt: new Date().toISOString(), submission: row.submission, submittedByUserId: owner }, listingId)
    : buildMockPropertyFromAdminRow(row, listingId);
  appendExtraListing({ ...prop, managerUserId: owner, adminPublishLive: true }, owner);
  const nextUn = [...side.unlisted.slice(0, idx), ...side.unlisted.slice(idx + 1)];
  writeSideStorage({ ...side, unlisted: nextUn }, forManagerUserId);
  return listingId;
}

export function moveListedToRequestChange(
  listingId: string,
  forManagerUserId?: string | null,
  editRequestNote?: string,
): boolean {
  const removed = removeExtraListing(listingId);
  if (!removed) return false;
  const side = readSide(forManagerUserId);
  const note = editRequestNote?.trim();
  side.requestChange.push({
    ...mockToAdminRow(removed, listingId),
    ...(note ? { editRequestNote: note } : {}),
  });
  writeSideStorage(side, forManagerUserId);
  return true;
}

export function moveListedToRejected(listingId: string, forManagerUserId?: string | null): boolean {
  if (!adminListingRejectAllowed()) return false;
  const removed = removeExtraListing(listingId);
  if (!removed) return false;
  const side = readSide(forManagerUserId);
  side.rejected.push({ ...mockToAdminRow(removed, listingId), adminRefId: newAdminRefId() });
  writeSideStorage(side, forManagerUserId);
  return true;
}

export function moveUnlistedToRejected(adminRefId: string, forManagerUserId?: string | null): boolean {
  if (!adminListingRejectAllowed()) return false;
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

/** Permanently removes a row from the rejected bucket (demo localStorage). */
export function removeRejectedProperty(adminRefId: string, forManagerUserId?: string | null): boolean {
  const side = readSide(forManagerUserId);
  const idx = side.rejected.findIndex((r) => r.adminRefId === adminRefId);
  if (idx === -1) return false;
  const nextR = [...side.rejected.slice(0, idx), ...side.rejected.slice(idx + 1)];
  writeSideStorage({ ...side, rejected: nextR }, forManagerUserId);
  return true;
}

/** Previously seeded demo rows for manager side-buckets; disabled until the real flow ships. */
export function ensureDemoManagerSideBucketsSeed(_forManagerUserId: string | null): void {
  /* no-op */
}

/** Permanently removes a live mgr-* listing from the portal (does not move to Unlisted). */
export function deleteManagerLiveListing(listingId: string, forManagerUserId: string | null): boolean {
  if (!forManagerUserId?.trim()) return false;
  const extras = readExtraListingsForUser(forManagerUserId);
  const hit = extras.find((p) => p.id === listingId);
  if (!hit || !hit.id.startsWith("mgr-")) return false;
  return removeExtraListing(listingId) !== null;
}

/** Drops a row from the manager-only unlisted queue (does not restore a public listing). */
export function deleteUnlistedManagerProperty(adminRefId: string, forManagerUserId: string | null): boolean {
  const side = readSide(forManagerUserId);
  const idx = side.unlisted.findIndex((r) => r.adminRefId === adminRefId);
  if (idx === -1) return false;
  const nextUn = [...side.unlisted.slice(0, idx), ...side.unlisted.slice(idx + 1)];
  writeSideStorage({ ...side, unlisted: nextUn }, forManagerUserId);
  return true;
}
