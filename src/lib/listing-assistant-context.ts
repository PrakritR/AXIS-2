import {
  listingMediaInventoryFromSubmission,
  type ListingMediaInventory,
} from "@/lib/listing-media-placement.server";
import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";

function singleLine(value: string, maxLen: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLen);
}

function formatInventory(inv: ListingMediaInventory): string {
  const parts: string[] = [];
  if (inv.rooms.length) {
    parts.push(
      `rooms=${inv.rooms.map((r) => `${r.id}:${singleLine(r.label, 40)}(${r.photoCount}p)`).join(",")}`,
    );
  }
  if (inv.bathrooms.length) {
    parts.push(
      `bathrooms=${inv.bathrooms.map((b) => `${b.id}:${singleLine(b.label, 40)}(${b.photoCount}p)`).join(",")}`,
    );
  }
  if (inv.sharedSpaces.length) {
    parts.push(
      `shared=${inv.sharedSpaces.map((s) => `${s.id}:${singleLine(s.label, 40)}(${s.photoCount}p)`).join(",")}`,
    );
  }
  parts.push(`housePhotos=${inv.housePhotoCount}`);
  return parts.join(" · ");
}

/** Rich one-line context for the listing wizard assistant strip. */
export function buildListingModalAssistantContext(opts: {
  wizardTitle: string;
  stepLabel: string;
  propertyId: string | null;
  submission: ManagerListingSubmissionV1;
}): string {
  const parts = [`${opts.wizardTitle} · ${opts.stepLabel}`];
  const propertyId = opts.propertyId?.trim();
  if (propertyId) {
    parts.push(`propertyId=${propertyId}`);
  } else {
    parts.push("propertyId=(save draft first — photos can upload but placement needs a property id)");
  }
  const title = opts.submission.buildingName?.trim() || opts.submission.address?.trim();
  if (title) parts.push(`listing=${singleLine(title, 80)}`);
  parts.push(formatInventory(listingMediaInventoryFromSubmission(opts.submission)));
  parts.push(
    "Classify each attached image (bathroom, bedroom, kitchen, exterior, living, etc.) and propose apply_listing_photos with propertyId and target ids from the inventory — do not put room/bath shots only in housePhotoUrls.",
  );
  return parts.join(" · ");
}
