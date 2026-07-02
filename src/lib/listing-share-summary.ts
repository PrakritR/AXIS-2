import type { MockProperty } from "@/data/types";
import { isEntireHomeListing, normalizeManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import { monthlyRentListingLabel } from "@/lib/rental-application/listing-fees-display";

export type ListingShareSummary = {
  title: string;
  detailLines: string[];
};

/** Short bullet-style facts for prospect emails (no long amenity lists). */
export function buildListingShareSummary(
  property: MockProperty,
  options?: { roomChoice?: string },
): ListingShareSummary {
  const title = (property.title || property.buildingName || property.address).trim() || "Listing";
  const lines: string[] = [];

  const addressLine = [property.address?.trim(), property.neighborhood?.trim()].filter(Boolean).join(" · ");
  if (addressLine) lines.push(addressLine);

  const rent = property.rentLabel?.trim() || monthlyRentListingLabel(property.listingSubmission);
  if (rent && rent !== "—") lines.push(`Rent: ${rent}`);

  if (property.beds > 0 || property.baths > 0) {
    const bedBath = [
      property.beds > 0 ? `${property.beds} bed${property.beds === 1 ? "" : "s"}` : null,
      property.baths > 0 ? `${property.baths} bath${property.baths === 1 ? "" : "s"}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    if (bedBath) lines.push(bedBath);
  }

  const sub = property.listingSubmission;
  if (sub?.v) {
    const normalized = normalizeManagerListingSubmissionV1(sub);
    if (!isEntireHomeListing(normalized)) {
      const rooms = normalized.rooms.filter((r) => r.name.trim());
      const selectedRoom = options?.roomChoice?.trim();
      if (selectedRoom) {
        const room = rooms.find((r) => r.name.trim() === selectedRoom);
        if (room) {
          lines.push(`${room.name.trim()}${room.monthlyRent > 0 ? ` · $${room.monthlyRent.toLocaleString()}/mo` : ""}`);
        } else {
          lines.push(selectedRoom);
        }
      } else {
        const roomCount = rooms.length;
        if (roomCount > 0) lines.push(`${roomCount} room${roomCount === 1 ? "" : "s"} available`);
      }
    }
  }

  const available = property.available?.trim();
  if (available && available !== "—") lines.push(`Available: ${available}`);

  lines.push(property.petFriendly ? "Pets welcome" : "No pets");

  const tagline = property.tagline?.trim();
  if (tagline && tagline.length <= 140) lines.push(tagline);

  return { title, detailLines: lines };
}
