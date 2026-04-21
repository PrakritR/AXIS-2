import type { MockProperty } from "@/data/types";

/** Fallback map center when property has no explicit coordinates. */
export function listingFallbackMapCenter(property: MockProperty): { lat: number; lng: number } {
  if (property.mapLat != null && property.mapLng != null) {
    return { lat: property.mapLat, lng: property.mapLng };
  }
  switch (property.zip) {
    case "98122":
      return { lat: 47.6141, lng: -122.3155 };
    case "98103":
      return { lat: 47.6515, lng: -122.349 };
    case "98107":
      return { lat: 47.6774, lng: -122.3857 };
    default:
      return { lat: 47.6062, lng: -122.3321 };
  }
}
