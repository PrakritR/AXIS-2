import type { MockProperty } from "@/data/types";

export type GeocodeCoords = { lat: number; lng: number };

export type AddressSuggestion = {
  id: string;
  label: string;
  address: string;
  zip: string;
  neighborhood: string;
  city: string;
  lat: number | null;
  lng: number | null;
};

type NominatimAddressParts = {
  house_number?: string;
  road?: string;
  pedestrian?: string;
  neighbourhood?: string;
  suburb?: string;
  city_district?: string;
  quarter?: string;
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  municipality?: string;
  county?: string;
  postcode?: string;
  building?: string;
};

export type NominatimSearchHit = {
  place_id?: number | string;
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: NominatimAddressParts;
};

/** Build a stable geocoding query from listing address fields. */
export function listingGeocodeQuery(
  property: Pick<MockProperty, "address" | "zip" | "neighborhood" | "unitLabel">,
): string {
  const street = property.address?.trim() ?? "";
  const unit = property.unitLabel?.trim() ?? "";
  const neighborhood = property.neighborhood?.trim() ?? "";
  const zip = property.zip?.trim() ?? "";

  // Deliberately DROP the unit from the geocode query. A unit is inside the same
  // building, so it adds no geographic precision, but "APT 211" / "#3" is not a
  // geocodable token and measurably degrades the match - Nominatim either misses
  // or returns a lower-confidence centroid. Strip a unit already embedded in the
  // street line for the same reason; the unit is still shown in the UI.
  // Match a SINGLE leading separator (`[,\s]`, not `[,\s]+`) before the unit
  // token: the immediately-following `.replace(/[,\s]+$/, "")` strips any extra
  // trailing separators the same way, so the final output is identical while the
  // regex stays linear-time (the `[,\s]+` variant backtracks polynomially on a
  // long run of whitespace — CodeQL js/polynomial-redos).
  const streetLine = (street || unit)
    .replace(/[,\s](?:apt|apartment|unit|ste|suite|#)\s*[\w-]+\s*$/i, "")
    .replace(/[,\s]+$/, "")
    .trim() || street;

  const parts = [streetLine, neighborhood, zip].filter(Boolean);
  if (!parts.length) return "";

  const query = parts.join(", ");
  if (/^\d{5}(-\d{4})?$/.test(zip) && !/\b(usa|united states)\b/i.test(query)) {
    return `${query}, USA`;
  }
  return query;
}

export function parseGeocodeResult(value: unknown): GeocodeCoords | null {
  if (!value || typeof value !== "object") return null;
  const lat = Number((value as { lat?: unknown }).lat);
  const lng = Number((value as { lng?: unknown }).lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

/** Map a Nominatim search hit into listing address fields. */
export function parseNominatimAddressSuggestion(hit: NominatimSearchHit): AddressSuggestion | null {
  const parts = hit.address ?? {};
  const road = firstNonEmpty(parts.road, parts.pedestrian);
  const house = parts.house_number?.trim() ?? "";
  const street = house && road ? `${house} ${road}` : firstNonEmpty(road, house);
  const city = firstNonEmpty(parts.city, parts.town, parts.village, parts.hamlet, parts.municipality);
  const neighborhood = firstNonEmpty(
    parts.neighbourhood,
    parts.suburb,
    parts.city_district,
    parts.quarter,
    city,
  );
  const zip = (parts.postcode?.trim() ?? "").replace(/\s+/g, "").slice(0, 10);
  const label = hit.display_name?.trim() || [street, neighborhood, city, zip].filter(Boolean).join(", ");
  if (!street && !label) return null;

  const coords = parseGeocodeResult({ lat: hit.lat, lng: hit.lon });
  const id = String(hit.place_id ?? label);

  return {
    id,
    label,
    address: street || label.split(",")[0]?.trim() || "",
    zip,
    neighborhood,
    city,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
  };
}

export function parseNominatimAddressSuggestions(value: unknown): AddressSuggestion[] {
  if (!Array.isArray(value)) return [];
  const out: AddressSuggestion[] = [];
  const seen = new Set<string>();
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const parsed = parseNominatimAddressSuggestion(row as NominatimSearchHit);
    if (!parsed) continue;
    const key = `${parsed.address}|${parsed.zip}|${parsed.neighborhood}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(parsed);
  }
  return out;
}
