import type { MockProperty } from "@/data/types";
import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";

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

const PENDING_KEY = "axis_manager_pending_properties_v1";
const EXTRAS_KEY = "axis_public_extra_listings_v1";

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
  /** Full submission used to generate listing detail page */
  submission?: ManagerListingSubmissionV1;
};

export type ManagerPropertyDraftInput = ManagerListingSubmissionV1;

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

function deriveLegacyFields(sub: ManagerListingSubmissionV1): Omit<ManagerPendingPropertyRow, "id" | "submittedAt" | "submission"> {
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

export function readPendingManagerProperties(): ManagerPendingPropertyRow[] {
  return readJson<ManagerPendingPropertyRow[]>(PENDING_KEY, []);
}

export function readExtraListings(): MockProperty[] {
  return readJson<MockProperty[]>(EXTRAS_KEY, []);
}

/** Pending submissions + live manager listings (demo localStorage). */
export function countManagerManagedProperties(): number {
  return readPendingManagerProperties().length + readExtraListings().length;
}

function slugPart(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

export function submitManagerPendingProperty(input: ManagerPropertyDraftInput): string {
  const id = `pend-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const legacy = deriveLegacyFields(input);
  const row: ManagerPendingPropertyRow = {
    ...legacy,
    id,
    submittedAt: new Date().toISOString(),
    submission: input,
  };
  const list = readPendingManagerProperties();
  list.push(row);
  writeJson(PENDING_KEY, list);
  return id;
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
  };
  return buildMockPropertyFromDraft(pendingLike, listingId);
}

export function buildMockPropertyFromDraft(row: ManagerPendingPropertyRow, listingId: string): MockProperty {
  const title = `${row.buildingName} · ${row.unitLabel}`;
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
  };
}

export function appendExtraListing(prop: MockProperty) {
  const extras = readExtraListings();
  extras.push(prop);
  writeJson(EXTRAS_KEY, extras);
}

/** Removes a pending row without publishing. Returns the row or null. */
export function takePendingManagerProperty(pendingId: string): ManagerPendingPropertyRow | null {
  const pending = readPendingManagerProperties();
  const idx = pending.findIndex((p) => p.id === pendingId);
  if (idx === -1) return null;
  const row = pending[idx]!;
  writeJson(PENDING_KEY, [...pending.slice(0, idx), ...pending.slice(idx + 1)]);
  return row;
}

export function removeExtraListing(listingId: string): MockProperty | null {
  const extras = readExtraListings();
  const idx = extras.findIndex((p) => p.id === listingId);
  if (idx === -1) return null;
  const row = extras[idx]!;
  writeJson(EXTRAS_KEY, [...extras.slice(0, idx), ...extras.slice(idx + 1)]);
  return row;
}

/** Promotes a manager submission to a public listing (demo: localStorage only). */
export function approvePendingManagerProperty(pendingId: string): MockProperty | null {
  const row = takePendingManagerProperty(pendingId);
  if (!row) return null;

  const listingId = `mgr-${slugPart(row.buildingName)}-${slugPart(row.unitLabel)}-${pendingId.slice(-6)}`;
  const prop = buildMockPropertyFromDraft(row, listingId);
  appendExtraListing(prop);
  return prop;
}
