export type ManagerAmenityOffer = {
  id: string;
  name: string;
  description: string;
  price: string;
  deposit: string;
  category: string;
  available: boolean;
  managerUserId: string;
  propertyId?: string;
  residentEmails?: string[];
  createdAt: string;
};

const KEY = "axis_amenity_catalog_v1";
export const AMENITY_CATALOG_EVENT = "axis:amenity-catalog";

type Store = Record<string, ManagerAmenityOffer[]>;

function read(): Store {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Store; } catch { return {}; }
}

function write(store: Store): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(store));
  window.dispatchEvent(new Event(AMENITY_CATALOG_EVENT));
}

export function readAmenityOffersForManager(managerUserId: string): ManagerAmenityOffer[] {
  return read()[managerUserId] ?? [];
}

export function readAmenityOffersForProperty(managerUserId: string, propertyId: string): ManagerAmenityOffer[] {
  const all = read()[managerUserId] ?? [];
  if (!propertyId.trim()) return all;
  // Offers with no propertyId are global (show for all properties); also include property-specific matches.
  return all.filter((o) => !o.propertyId?.trim() || o.propertyId.trim() === propertyId.trim());
}

export function saveAmenityOffer(offer: ManagerAmenityOffer): void {
  const store = read();
  const list = store[offer.managerUserId] ?? [];
  const idx = list.findIndex((o) => o.id === offer.id);
  if (idx === -1) store[offer.managerUserId] = [offer, ...list];
  else list[idx] = offer;
  if (idx !== -1) store[offer.managerUserId] = list;
  write(store);
}

export function deleteAmenityOffer(id: string, managerUserId: string): void {
  const store = read();
  store[managerUserId] = (store[managerUserId] ?? []).filter((o) => o.id !== id);
  write(store);
}

export function toggleAmenityOfferAvailability(id: string, managerUserId: string): void {
  const store = read();
  const list = store[managerUserId] ?? [];
  const idx = list.findIndex((o) => o.id === id);
  if (idx !== -1) list[idx] = { ...list[idx]!, available: !list[idx]!.available };
  store[managerUserId] = list;
  write(store);
}

export function migrateAmenityOffersPropertyId(
  managerUserId: string,
  fromPropertyId: string | null | undefined,
  toPropertyId: string | null | undefined,
): void {
  const fromId = fromPropertyId?.trim() ?? "";
  const toId = toPropertyId?.trim() ?? "";
  if (!managerUserId.trim() || !fromId || !toId || fromId === toId) return;

  const store = read();
  const list = store[managerUserId] ?? [];
  let changed = false;
  const next = list.map((offer) => {
    if (offer.propertyId?.trim() !== fromId) return offer;
    changed = true;
    return { ...offer, propertyId: toId };
  });
  if (!changed) return;
  store[managerUserId] = next;
  write(store);
}

/** Scans ALL manager catalogs and returns offers visible for a given propertyId (global or matching). */
export function readAllAmenityOffersForProperty(propertyId: string): ManagerAmenityOffer[] {
  const store = read();
  const results: ManagerAmenityOffer[] = [];
  for (const offers of Object.values(store)) {
    for (const offer of offers) {
      if (!offer.propertyId?.trim() || offer.propertyId.trim() === propertyId.trim()) {
        results.push(offer);
      }
    }
  }
  return results;
}

/** Scans ALL manager catalogs and returns all offers (for any property). */
export function readAllAmenityOffers(): ManagerAmenityOffer[] {
  const store = read();
  return Object.values(store).flat();
}

export const AMENITY_CATEGORIES = ["Cleaning", "Linens & Bedding", "Furniture", "Convenience", "Laundry", "Other"] as const;
export type AmenityCategory = typeof AMENITY_CATEGORIES[number];
