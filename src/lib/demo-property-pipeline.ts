import type { MockProperty } from "@/data/types";
import type { PropertyPipelineSnapshot, ManagerPropertyRecordStatus } from "@/lib/persisted-property-records";
import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import { parseRecordOfArrays } from "@/lib/safe-local-storage";

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
const memoryStore = new Map<string, unknown>();

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
  return typeof window !== "undefined";
}

function readJson<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  return memoryStore.has(key) ? (memoryStore.get(key) as T) : fallback;
}

function writeJson(key: string, value: unknown) {
  if (!isBrowser()) return;
  memoryStore.set(key, value);
  window.dispatchEvent(new Event(PROPERTY_PIPELINE_EVENT));
}

function readPendingMap(): PendingMap {
  return parseRecordOfArrays<ManagerPendingPropertyRow>(readJson(PENDING_BY_USER_KEY, {}));
}

function writePendingMap(m: PendingMap) {
  writeJson(PENDING_BY_USER_KEY, m);
}

function readExtrasMap(): ExtrasMap {
  return parseRecordOfArrays<MockProperty>(readJson(EXTRAS_BY_USER_KEY, {}));
}

function writeExtrasMap(m: ExtrasMap) {
  writeJson(EXTRAS_BY_USER_KEY, m);
}

function mirrorPropertyRecord(input: {
  id: string;
  managerUserId: string | null;
  status: ManagerPropertyRecordStatus;
  rowData?: unknown;
  propertyData?: unknown;
  editRequestNote?: string | null;
}) {
  if (typeof window === "undefined") return;
  void fetch("/api/property-records", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "upsert",
      id: input.id,
      managerUserId: input.managerUserId,
      status: input.status,
      rowData: input.rowData ?? null,
      propertyData: input.propertyData ?? null,
      editRequestNote: input.editRequestNote ?? null,
    }),
  }).catch(() => {});
}

async function upsertPropertyRecordToServer(input: {
  id: string;
  managerUserId: string | null;
  status: ManagerPropertyRecordStatus;
  rowData?: unknown;
  propertyData?: unknown;
  editRequestNote?: string | null;
}): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const res = await fetch("/api/property-records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        action: "upsert",
        id: input.id,
        managerUserId: input.managerUserId,
        status: input.status,
        rowData: input.rowData ?? null,
        propertyData: input.propertyData ?? null,
        editRequestNote: input.editRequestNote ?? null,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function deleteMirroredPropertyRecord(id: string) {
  if (typeof window === "undefined") return;
  void fetch("/api/property-records", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "delete", id }),
  }).catch(() => {});
}

export function cachePublicExtraListings(listings: MockProperty[]) {
  if (!isBrowser()) return;
  const map = readExtrasMap();
  for (const listing of listings) {
    const uid = listing.managerUserId?.trim() || LEGACY_MANAGER_SCOPE_USER_ID;
    const list = map[uid] ?? [];
    const idx = list.findIndex((p) => p.id === listing.id);
    const next = { ...listing, managerUserId: uid };
    if (idx === -1) list.push(next);
    else list[idx] = next;
    map[uid] = list;
  }
  writeExtrasMap(map);
}

export async function syncPropertyPipelineFromServer(): Promise<boolean> {
  if (!isBrowser()) return false;
  try {
    const res = await fetch("/api/property-records", { credentials: "include", cache: "no-store" });
    const body = (await res.json()) as { snapshot?: PropertyPipelineSnapshot };
    if (!res.ok || !body.snapshot) return false;
    memoryStore.set(PENDING_BY_USER_KEY, body.snapshot.pendingByUser);
    memoryStore.set(EXTRAS_BY_USER_KEY, body.snapshot.extrasByUser);
    memoryStore.set("axis_admin_property_buckets_v1", body.snapshot.sideGlobal);
    for (const [userId, side] of Object.entries(body.snapshot.sideByUser)) {
      memoryStore.set(`axis_mgr_property_side_v1_${userId}`, side);
    }
    window.dispatchEvent(new Event(PROPERTY_PIPELINE_EVENT));
    return true;
  } catch {
    return false;
  }
}

export async function mirrorLocalPropertyPipelineToServer(): Promise<void> {
  if (!isBrowser()) return;
  const pendingMap = readPendingMap();
  const extrasMap = readExtrasMap();
  const jobs: Promise<unknown>[] = [];
  for (const [managerUserId, rows] of Object.entries(pendingMap)) {
    for (const row of rows) {
      jobs.push(
        fetch("/api/property-records", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "upsert", id: row.id, managerUserId, status: "pending", rowData: row }),
        }).catch(() => {}),
      );
    }
  }
  for (const [managerUserId, rows] of Object.entries(extrasMap)) {
    for (const row of rows) {
      jobs.push(
        fetch("/api/property-records", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "upsert",
            id: row.id,
            managerUserId,
            status: row.adminPublishLive === true ? "live" : "review",
            propertyData: row,
          }),
        }).catch(() => {}),
      );
    }
  }
  await Promise.allSettled(jobs);
}

export async function loadPublicExtraListingsFromServer(): Promise<MockProperty[]> {
  try {
    const res = await fetch("/api/property-records/public", { cache: "no-store" });
    const body = (await res.json()) as { listings?: MockProperty[] };
    if (!res.ok) return readExtraListingsPublic();
    const listings = body.listings ?? [];
    cachePublicExtraListings(listings);
    return listings;
  } catch {
    return readExtraListingsPublic();
  }
}

/**
 * One-time: moves flat legacy arrays into the signed-in user's bucket so other accounts stay isolated.
 */
function migrateLegacyGlobalIntoUser(userId: string) {
  void userId;
}

/** All pending rows (admin queue). Legacy global pending key is no longer merged — only per-account storage. */
export function readAllPendingManagerProperties(): ManagerPendingPropertyRow[] {
  const map = readPendingMap();
  return Object.values(map).flat();
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

/** All extra listings across accounts (admin + public catalog). Legacy global extras key is no longer merged. */
export function readAllExtraListings(): MockProperty[] {
  const map = readExtrasMap();
  return Object.values(map).flat();
}

/** Properties visible on `/rent/listings` and hero search — admin-approved live listings only. */
export function isRentCatalogPublished(p: Pick<MockProperty, "adminPublishLive">): boolean {
  return p.adminPublishLive === true;
}

/** Public Rent with Axis catalog: extras that are approved for live search (demo localStorage). */
export function readExtraListingsPublic(): MockProperty[] {
  const byPropertyKey = new Map<string, MockProperty>();
  for (const property of readAllExtraListings().filter(isRentCatalogPublished)) {
    const key = `${property.buildingName}::${property.address}`.trim().toLowerCase();
    byPropertyKey.set(key, property);
  }
  return [...byPropertyKey.values()];
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

function slugPart(s: string | undefined | null) {
  return String(s ?? "")
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
  mirrorPropertyRecord({ id, managerUserId, status: "pending", rowData: row });
  return id;
}

export async function submitManagerPendingPropertyToServer(
  input: ManagerPropertyDraftInput,
  managerUserId: string,
): Promise<string | null> {
  if (!managerUserId.trim()) return null;
  const id = `pend-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const legacy = deriveLegacyFields(input);
  const row: ManagerPendingPropertyRow = {
    ...legacy,
    id,
    submittedAt: new Date().toISOString(),
    submission: input,
    submittedByUserId: managerUserId,
  };
  const ok = await upsertPropertyRecordToServer({ id, managerUserId, status: "pending", rowData: row });
  if (!ok) return null;
  const map = readPendingMap();
  map[managerUserId] = [...(map[managerUserId] ?? []), row];
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
  mirrorPropertyRecord({ id: pendingId, managerUserId, status: "pending", rowData: list[idx] });
  return true;
}

export async function updatePendingManagerPropertyOnServer(
  pendingId: string,
  input: ManagerPropertyDraftInput,
  managerUserId: string,
): Promise<boolean> {
  if (!managerUserId.trim()) return false;
  const map = readPendingMap();
  const list = map[managerUserId] ?? [];
  const idx = list.findIndex((p) => p.id === pendingId);
  const legacy = deriveLegacyFields(input);
  const row: ManagerPendingPropertyRow = {
    ...(idx === -1 ? { id: pendingId, submittedAt: new Date().toISOString(), submittedByUserId: managerUserId } : list[idx]!),
    ...legacy,
    submission: input,
  };
  const ok = await upsertPropertyRecordToServer({ id: pendingId, managerUserId, status: "pending", rowData: row });
  if (!ok) return false;
  const nextList = [...list];
  if (idx === -1) nextList.push(row);
  else nextList[idx] = row;
  map[managerUserId] = nextList;
  writePendingMap(map);
  await syncPropertyPipelineFromServer();
  return true;
}

export function updateExtraListingFromSubmission(
  listingId: string,
  managerUserId: string,
  input: ManagerPropertyDraftInput,
): boolean {
  if (!managerUserId.trim()) return false;
  const map = readExtrasMap();
  const list = map[managerUserId] ?? [];
  const idx = list.findIndex((p) => p.id === listingId);
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
  /** Any manager edit takes the listing off the public catalog until admin approves again. */
  list[idx] = { ...next, managerUserId: owner, adminPublishLive: false };
  map[managerUserId] = list;
  writeExtrasMap(map);
  mirrorPropertyRecord({
    id: listingId,
    managerUserId,
    status: "review",
    propertyData: list[idx],
    rowData: { ...legacy, adminRefId: listingId, listingId, managerUserId },
  });
  return true;
}

export async function updateExtraListingFromSubmissionOnServer(
  listingId: string,
  managerUserId: string,
  input: ManagerPropertyDraftInput,
): Promise<boolean> {
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
  const next = buildMockPropertyFromDraft(pendingLike, listingId);
  const owner = next.managerUserId ?? managerUserId;
  const propertyData: MockProperty = { ...next, managerUserId: owner, adminPublishLive: false };
  const rowData = { ...legacy, adminRefId: listingId, listingId, managerUserId };
  const ok = await upsertPropertyRecordToServer({
    id: listingId,
    managerUserId,
    status: "review",
    propertyData,
    rowData,
  });
  if (!ok) return false;
  const nextList = [...list];
  if (idx === -1) nextList.push(propertyData);
  else nextList[idx] = propertyData;
  map[managerUserId] = nextList;
  writeExtrasMap(map);
  await syncPropertyPipelineFromServer();
  return true;
}

/** Sets a manager `mgr-*` listing live on the rent catalog again after admin review. */
export function republishManagerListingAfterReview(listingId: string): boolean {
  if (!listingId.startsWith("mgr-")) return false;
  const map = readExtrasMap();
  for (const uid of Object.keys(map)) {
    const list = map[uid]!;
    const idx = list.findIndex((p) => p.id === listingId);
    if (idx === -1) continue;
    const cur = list[idx]!;
    list[idx] = { ...cur, adminPublishLive: true };
    map[uid] = list;
    writeExtrasMap(map);
    mirrorPropertyRecord({ id: listingId, managerUserId: uid, status: "live", propertyData: list[idx] });
    return true;
  }
  return false;
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
  const str = (v: unknown) => String(v ?? "").trim();
  const num = (v: unknown, fallback = 0) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const buildingName = str(row.buildingName);
  const unitLabel = str(row.unitLabel);
  const title = `${buildingName || "Property"} · ${unitLabel || "Unit"}`;
  const owner = row.submittedByUserId ?? LEGACY_MANAGER_SCOPE_USER_ID;
  const monthlyRent = num(row.monthlyRent, 0);
  const beds = Math.max(0, Math.floor(num(row.beds, 1)));
  const baths = Math.max(0, num(row.baths, 1));
  return {
    id: listingId,
    title,
    tagline: str(row.tagline) || "Manager-submitted listing",
    address: str(row.address),
    zip: str(row.zip),
    neighborhood: str(row.neighborhood),
    beds,
    baths,
    rentLabel: `$${monthlyRent} / mo`,
    available: "Now",
    petFriendly: Boolean(row.petFriendly),
    buildingId: `mgr-bld-${slugPart(buildingName)}`,
    buildingName,
    unitLabel,
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
  mirrorPropertyRecord({ id: prop.id, managerUserId: uid, status: prop.adminPublishLive === true ? "live" : "review", propertyData: { ...prop, managerUserId: uid } });
}

/** Deletes a pending submission from the signed-in manager’s queue only (does not approve or publish). */
export function deletePendingSubmissionForManager(pendingId: string, managerUserId: string | null): boolean {
  if (!managerUserId?.trim()) return false;
  const uid = managerUserId.trim();
  migrateLegacyGlobalIntoUser(uid);
  const map = readPendingMap();
  const list = map[uid] ?? [];
  const idx = list.findIndex((p) => p.id === pendingId);
  if (idx === -1) return false;
  map[uid] = [...list.slice(0, idx), ...list.slice(idx + 1)];
  writePendingMap(map);
  deleteMirroredPropertyRecord(pendingId);
  window.dispatchEvent(new Event(PROPERTY_PIPELINE_EVENT));
  return true;
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
      deleteMirroredPropertyRecord(pendingId);
      return row;
    }
  }
  return null;
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
      deleteMirroredPropertyRecord(listingId);
      return row;
    }
  }
  return null;
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
