import type { MockProperty } from "@/data/types";

/** Last-resort map center when geocoding fails and no stored coordinates exist. */
export function listingFallbackMapCenter(property: MockProperty): { lat: number; lng: number } {
  if (property.mapLat != null && property.mapLng != null) {
    return { lat: property.mapLat, lng: property.mapLng };
  }
  // Generic US center — avoids pinning unrelated listings to Seattle when geocoding fails.
  return { lat: 39.8283, lng: -98.5795 };
}
