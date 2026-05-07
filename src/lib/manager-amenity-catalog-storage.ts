export type ManagerAmenityOffer = {
  id: string;
  name: string;
  description: string;
  price: string;
  category: string;
  available: boolean;
  managerUserId: string;
  createdAt: string;
};

const KEY = "axis_amenity_catalog_v1";

type Store = Record<string, ManagerAmenityOffer[]>;

function read(): Store {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Store; } catch { return {}; }
}

function write(store: Store): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(store));
}

export function readAmenityOffersForManager(managerUserId: string): ManagerAmenityOffer[] {
  return read()[managerUserId] ?? [];
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

export const AMENITY_CATEGORIES = ["Cleaning", "Linens & Bedding", "Furniture", "Convenience", "Laundry", "Other"] as const;
export type AmenityCategory = typeof AMENITY_CATEGORIES[number];
