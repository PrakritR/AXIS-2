import type { MockProperty } from "@/data/types";

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
};

export type ManagerPropertyDraftInput = Omit<ManagerPendingPropertyRow, "id" | "submittedAt">;

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

export function readPendingManagerProperties(): ManagerPendingPropertyRow[] {
  return readJson<ManagerPendingPropertyRow[]>(PENDING_KEY, []);
}

export function readExtraListings(): MockProperty[] {
  return readJson<MockProperty[]>(EXTRAS_KEY, []);
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
  const row: ManagerPendingPropertyRow = {
    ...input,
    id,
    submittedAt: new Date().toISOString(),
  };
  const list = readPendingManagerProperties();
  list.push(row);
  writeJson(PENDING_KEY, list);
  return id;
}

/** Promotes a manager submission to a public listing (demo: localStorage only). */
export function approvePendingManagerProperty(pendingId: string): MockProperty | null {
  const pending = readPendingManagerProperties();
  const idx = pending.findIndex((p) => p.id === pendingId);
  if (idx === -1) return null;
  const row = pending[idx]!;
  const nextPending = [...pending.slice(0, idx), ...pending.slice(idx + 1)];
  writeJson(PENDING_KEY, nextPending);

  const listingId = `mgr-${slugPart(row.buildingName)}-${slugPart(row.unitLabel)}-${pendingId.slice(-6)}`;
  const prop: MockProperty = {
    id: listingId,
    title: `${row.buildingName} · ${row.unitLabel}`,
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
  };

  const extras = readExtraListings();
  extras.push(prop);
  writeJson(EXTRAS_KEY, extras);
  return prop;
}
