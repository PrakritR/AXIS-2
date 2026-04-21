import type { MockProperty } from "@/data/types";
import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";

/** Admin-only / legacy listings not tied to a real manager auth user (demo localStorage bucket). */
export const LEGACY_MANAGER_SCOPE_USER_ID = "__axis_legacy__";

/** Admin UI row shape (see demo-admin-property-inventory) — maps to pending row for publishing. */
export type ManagerAdminShapeRow = {
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
};

const PENDING_BY_USER_KEY = "axis_manager_pending_by_user_v1";
const EXTRAS_BY_USER_KEY = "axis_manager_extras_by_user_v1";

/** Pre–per-account migration (single global arrays). */
const LEGACY_PENDING_KEY = "axis_manager_pending_properties_v1";
const LEGACY_EXTRAS_KEY = "axis_public_extra_listings_v1";

export const PROPERTY_PIPELINE_EVENT = "axis-property-pipeline";

export type ManagerPendingPropertyRow = {
  id: string;
  submittedAt: string;
  buildingName: string;
  address: string;
  zip: string;
  neighborhood: string;
  unitLabel: string;
  beds: number;
  baths: number;
  monthlyRent: number;
  petFriendly: boolean;
  tagline: string;
  /** Supabase auth user id of the manager who submitted (required for new submissions). */
  submittedByUserId?: string;
  /** Full submission used to generate listing detail page */
  submission?: ManagerListingSubmissionV1;
};

export type ManagerPropertyDraftInput = ManagerListingSubmissionV1;

type PendingMap = Record<string, ManagerPendingPropertyRow[]>;
type ExtrasMap = Record<string, MockProperty[]>;

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

function writeJson(key: string, value: unknown) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new Event(PROPERTY_PIPELINE_EVENT));
  } catch {
    /* ignore quota */
  }
}

function readPendingMap(): PendingMap {
  return readJson<PendingMap>(PENDING_BY_USER_KEY, {});
}

function writePendingMap(m: PendingMap) {
  writeJson(PENDING_BY_USER_KEY, m);
}

function readExtrasMap(): ExtrasMap {
  return readJson<ExtrasMap>(EXTRAS_BY_USER_KEY, {});
}

function writeExtrasMap(m: ExtrasMap) {
  writeJson(EXTRAS_BY_USER_KEY, m);
}

/**
 * One-time: moves flat legacy arrays into the signed-in user's bucket so other accounts stay isolated.
 */
function migrateLegacyGlobalIntoUser(userId: string) {
  if (!isBrowser()) return;
  const map = readPendingMap();
  const em = readExtrasMap();
  if (map[userId]?.length || em[userId]?.length) return;

  const legacyP = readJson<ManagerPendingPropertyRow[]>(LEGACY_PENDING_KEY, []);
  const legacyE = readJson<MockProperty[]>(LEGACY_EXTRAS_KEY, []);
  if (legacyP.length === 0 && legacyE.length === 0) return;

  map[userId] = legacyP.map((r) => ({
    ...r,
    submittedByUserId: r.submittedByUserId ?? userId,
  }));
  em[userId] = legacyE.map((p) => ({
    ...p,
    managerUserId: p.managerUserId ?? userId,
  }));
  writePendingMap(map);
  writeExtrasMap(em);
  try {
    window.localStorage.removeItem(LEGACY_PENDING_KEY);
    window.localStorage.removeItem(LEGACY_EXTRAS_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(PROPERTY_PIPELINE_EVENT));
}

/** All pending rows (admin queue). */
export function readAllPendingManagerProperties(): ManagerPendingPropertyRow[] {
  const map = readPendingMap();
  const flat = Object.values(map).flat();
  const legacy = readJson<ManagerPendingPropertyRow[]>(LEGACY_PENDING_KEY, []);
  const seen = new Set(flat.map((r) => r.id));
  for (const r of legacy) {
    if (!seen.has(r.id)) {
      flat.push(r);
      seen.add(r.id);
    }
  }
  return flat;
}

/** Pending submissions for one manager account only. */
export function readPendingManagerPropertiesForUser(userId: string | null): ManagerPendingPropertyRow[] {
  if (!userId) return [];
  migrateLegacyGlobalIntoUser(userId);
  return readPendingMap()[userId] ?? [];
}

/**
 * @deprecated Use readPendingManagerPropertiesForUser (manager) or readAllPendingManagerProperties (admin).
 * Returns all pending rows for backward compatibility with admin KPIs.
 */
export function readPendingManagerProperties(): ManagerPendingPropertyRow[] {
  return readAllPendingManagerProperties();
}

/** All extra listings across accounts (admin + public catalog). */
export function readAllExtraListings(): MockProperty[] {
  const map = readExtrasMap();
  const flat = Object.values(map).flat();
  const legacy = readJson<MockProperty[]>(LEGACY_EXTRAS_KEY, []);
  const seen = new Set(flat.map((p) => p.id));
  for (const p of legacy) {
    if (!seen.has(p.id)) {
      flat.push(p);
      seen.add(p.id);
    }
  }
  return flat;
}

/** Public Rent with Axis catalog merges all manager-published listings. */
export function readExtraListingsPublic(): MockProperty[] {
  return readAllExtraListings();
}

/** Listed properties for one manager (portal). */
export function readExtraListingsForUser(userId: string | null): MockProperty[] {
  if (!userId) return [];
  migrateLegacyGlobalIntoUser(userId);
  return readExtrasMap()[userId] ?? [];
}

/**
 * @deprecated Use readExtraListingsForUser or readExtraListingsPublic.
 * Previously returned a single global list; now aliases public merge for older call sites.
 */
export function readExtraListings(): MockProperty[] {
  return readExtraListingsPublic();
}

/** Pending + live listings for one manager (property cap). */
export function countManagerManagedPropertiesForUser(userId: string | null): number {
  if (!userId) return 0;
  return readPendingManagerPropertiesForUser(userId).length + readExtraListingsForUser(userId).length;
}

/** @deprecated Use countManagerManagedPropertiesForUser */
export function countManagerManagedProperties(): number {
  return readAllPendingManagerProperties().length + readAllExtraListings().length;
}

function slugPart(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

function deriveLegacyFields(sub: ManagerListingSubmissionV1): Omit<ManagerPendingPropertyRow, "id" | "submittedAt" | "submission" | "submittedByUserId"> {
  const rooms = sub.rooms.filter((r) => r.name.trim().length > 0);
  const rents = rooms.map((r) => r.monthlyRent).filter((n) => Number.isFinite(n) && n > 0);
  const minRent = rents.length ? Math.min(...rents) : 0;
  const unitLabel =
    rooms.length === 0
      ? "New listing"
      : rooms.length === 1
        ? rooms[0]!.name.trim()
        : `${rooms.length} rooms`;

  return {
    buildingName: sub.buildingName.trim(),
    address: sub.address.trim(),
    zip: sub.zip.trim(),
    neighborhood: sub.neighborhood.trim(),
    unitLabel,
    beds: Math.max(rooms.length || 1, 1),
    baths: Math.max(sub.bathrooms.filter((b) => b.name.trim()).length || 1, 1),
    monthlyRent: minRent,
    petFriendly: sub.petFriendly,
    tagline: sub.tagline.trim() || sub.houseOverview.trim().slice(0, 120) || "Manager-submitted listing",
  };
}

export function submitManagerPendingProperty(input: ManagerPropertyDraftInput, managerUserId: string): string {
  if (!managerUserId.trim()) {
    throw new Error("submitManagerPendingProperty requires a signed-in manager user id.");
  }
  const id = `pend-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const legacy = deriveLegacyFields(input);
  const row: ManagerPendingPropertyRow = {
    ...legacy,
    id,
    submittedAt: new Date().toISOString(),
    submission: input,
    submittedByUserId: managerUserId,
  };
  const map = readPendingMap();
  const list = map[managerUserId] ?? [];
  list.push(row);
  map[managerUserId] = list;
  writePendingMap(map);
  return id;
}

export function updatePendingManagerProperty(
  pendingId: string,
  input: ManagerPropertyDraftInput,
  managerUserId: string,
): boolean {
  if (!managerUserId.trim()) return false;
  const map = readPendingMap();
  const list = map[managerUserId];
  if (!list) return false;
  const idx = list.findIndex((p) => p.id === pendingId);
  if (idx === -1) return false;
  const legacy = deriveLegacyFields(input);
  list[idx] = {
    ...list[idx]!,
    ...legacy,
    submission: input,
  };
  map[managerUserId] = list;
  writePendingMap(map);
  return true;
}

export function updateExtraListingFromSubmission(
  listingId: string,
  managerUserId: string,
  input: ManagerPropertyDraftInput,
): boolean {
  if (!managerUserId.trim()) return false;
  const map = readExtrasMap();
  const list = map[managerUserId];
  if (!list) return false;
  const idx = list.findIndex((p) => p.id === listingId);
  if (idx === -1) return false;
  const legacy = deriveLegacyFields(input);
  const pendingLike: ManagerPendingPropertyRow = {
    ...legacy,
    id: listingId,
    submittedAt: new Date().toISOString(),
    submission: input,
    submittedByUserId: managerUserId,
  };
  const prev = list[idx]!;
  const next = buildMockPropertyFromDraft(pendingLike, listingId);
  const owner = next.managerUserId ?? managerUserId;
  list[idx] = { ...next, managerUserId: owner, adminPublishLive: prev.adminPublishLive };
  map[managerUserId] = list;
  writeExtrasMap(map);
  return true;
}

/** Publish from an admin-bucket row (no stored submission — listing uses defaults until edited). */
export function buildMockPropertyFromAdminRow(row: ManagerAdminShapeRow, listingId: string): MockProperty {
  const pendingLike: ManagerPendingPropertyRow = {
    id: row.adminRefId,
    submittedAt: new Date().toISOString(),
    buildingName: row.buildingName,
    address: row.address,
    zip: row.zip,
    neighborhood: row.neighborhood,
    unitLabel: row.unitLabel,
    beds: row.beds,
    baths: row.baths,
    monthlyRent: row.monthlyRent,
    petFriendly: row.petFriendly,
    tagline: row.tagline,
    submission: undefined,
    submittedByUserId: LEGACY_MANAGER_SCOPE_USER_ID,
  };
  return buildMockPropertyFromDraft(pendingLike, listingId);
}

export function buildMockPropertyFromDraft(row: ManagerPendingPropertyRow, listingId: string): MockProperty {
  const title = `${row.buildingName} · ${row.unitLabel}`;
  const owner = row.submittedByUserId ?? LEGACY_MANAGER_SCOPE_USER_ID;
  return {
    id: listingId,
    title,
    tagline: row.tagline.trim() || "Manager-submitted listing",
    address: row.address.trim(),
    zip: row.zip.trim(),
    neighborhood: row.neighborhood.trim(),
    beds: row.beds,
    baths: row.baths,
    rentLabel: `$${row.monthlyRent} / mo`,
    available: "Now",
    petFriendly: row.petFriendly,
    buildingId: `mgr-bld-${slugPart(row.buildingName)}`,
    buildingName: row.buildingName.trim(),
    unitLabel: row.unitLabel.trim(),
    mapLat: 47.61405,
    mapLng: -122.31542,
    listingSubmission: row.submission,
    managerUserId: owner,
  };
}

export function appendExtraListing(prop: MockProperty, ownerUserId: string) {
  const uid = ownerUserId.trim() || prop.managerUserId || LEGACY_MANAGER_SCOPE_USER_ID;
  const map = readExtrasMap();
  const list = map[uid] ?? [];
  list.push({ ...prop, managerUserId: uid });
  map[uid] = list;
  writeExtrasMap(map);
}

/** Removes a pending row from whichever account owns it. */
export function takePendingManagerProperty(pendingId: string): ManagerPendingPropertyRow | null {
  const map = readPendingMap();
  for (const uid of Object.keys(map)) {
    const rows = map[uid]!;
    const idx = rows.findIndex((p) => p.id === pendingId);
    if (idx !== -1) {
      const row = rows[idx]!;
      map[uid] = [...rows.slice(0, idx), ...rows.slice(idx + 1)];
      writePendingMap(map);
      return row;
    }
  }
  const legacy = readJson<ManagerPendingPropertyRow[]>(LEGACY_PENDING_KEY, []);
  const idx = legacy.findIndex((p) => p.id === pendingId);
  if (idx === -1) return null;
  const row = legacy[idx]!;
  const next = [...legacy.slice(0, idx), ...legacy.slice(idx + 1)];
  writeJson(LEGACY_PENDING_KEY, next);
  window.dispatchEvent(new Event(PROPERTY_PIPELINE_EVENT));
  return row;
}

/** Removes a live listing from whichever account owns it. */
export function removeExtraListing(listingId: string): MockProperty | null {
  const map = readExtrasMap();
  for (const uid of Object.keys(map)) {
    const rows = map[uid]!;
    const idx = rows.findIndex((p) => p.id === listingId);
    if (idx !== -1) {
      const row = rows[idx]!;
      map[uid] = [...rows.slice(0, idx), ...rows.slice(idx + 1)];
      writeExtrasMap(map);
      return row;
    }
  }
  const legacy = readJson<MockProperty[]>(LEGACY_EXTRAS_KEY, []);
  const idx = legacy.findIndex((p) => p.id === listingId);
  if (idx === -1) return null;
  const row = legacy[idx]!;
  const next = [...legacy.slice(0, idx), ...legacy.slice(idx + 1)];
  writeJson(LEGACY_EXTRAS_KEY, next);
  window.dispatchEvent(new Event(PROPERTY_PIPELINE_EVENT));
  return row;
}

/** Promotes a manager submission to a public listing (per-owner storage). */
export function approvePendingManagerProperty(pendingId: string): MockProperty | null {
  const row = takePendingManagerProperty(pendingId);
  if (!row) return null;

  const listingId = `mgr-${slugPart(row.buildingName)}-${slugPart(row.unitLabel)}-${pendingId.slice(-6)}`;
  const prop: MockProperty = { ...buildMockPropertyFromDraft(row, listingId), adminPublishLive: true };
  const owner = row.submittedByUserId ?? LEGACY_MANAGER_SCOPE_USER_ID;
  appendExtraListing(prop, owner);
  return prop;
}

/** Reserved for optional onboarding seeding; no automatic listing data is injected. */
export function ensureDemoManagerPipelineSeed(_userId: string | null): void {
  /* no-op */
}
