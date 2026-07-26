import { listingMediaObjectPath } from "@/lib/listing-media-storage";
import {
  normalizeManagerListingSubmissionV1,
  type ManagerListingSubmissionV1,
} from "@/lib/manager-listing-submission";

export type ListingPhotoTarget = "house" | "room" | "bathroom" | "shared_space";

export type ListingPhotoPlacement = {
  photoUrl: string;
  target: ListingPhotoTarget;
  /** Required for room, bathroom, and shared_space targets. */
  targetId?: string;
  /** Optional label for previews (e.g. "Primary bath"). */
  label?: string;
};

const MAX_HOUSE_PHOTOS = 12;
const MAX_SLOT_PHOTOS = 8;

export function normalizeListingPhotoUrl(raw: string): string | null {
  const url = raw.trim();
  if (!url || url.startsWith("data:")) return null;
  if (!listingMediaObjectPath(url) && !url.includes("/listing-photos/")) return null;
  return url;
}

function appendUnique(urls: string[], url: string, max: number): string[] {
  if (urls.includes(url)) return urls;
  return [...urls, url].slice(-max);
}

export type ListingMediaPlacementResult = {
  submission: ManagerListingSubmissionV1;
  applied: { target: ListingPhotoTarget; targetId: string | null; label: string; url: string }[];
  skipped: { reason: string; url: string }[];
};

/** Merge uploaded listing-photo URLs into the correct house / room / bath / shared-space slots. */
export function applyListingPhotoPlacements(
  submission: ManagerListingSubmissionV1,
  placements: ListingPhotoPlacement[],
): ListingMediaPlacementResult {
  const sub = normalizeManagerListingSubmissionV1(submission);
  const applied: ListingMediaPlacementResult["applied"] = [];
  const skipped: ListingMediaPlacementResult["skipped"] = [];

  for (const placement of placements) {
    const url = normalizeListingPhotoUrl(placement.photoUrl);
    if (!url) {
      skipped.push({ reason: "invalid_url", url: placement.photoUrl });
      continue;
    }

    if (placement.target === "house") {
      const before = sub.housePhotoDataUrls.length;
      sub.housePhotoDataUrls = appendUnique(sub.housePhotoDataUrls, url, MAX_HOUSE_PHOTOS);
      if (sub.housePhotoDataUrls.length === before) {
        skipped.push({ reason: "duplicate_or_full", url });
      } else {
        applied.push({ target: "house", targetId: null, label: "House gallery", url });
      }
      continue;
    }

    const targetId = placement.targetId?.trim();
    if (!targetId) {
      skipped.push({ reason: "missing_target_id", url });
      continue;
    }

    if (placement.target === "room") {
      const room = sub.rooms.find((r) => r.id === targetId);
      if (!room) {
        skipped.push({ reason: "unknown_room", url });
        continue;
      }
      const before = room.photoDataUrls.length;
      room.photoDataUrls = appendUnique(room.photoDataUrls, url, MAX_SLOT_PHOTOS);
      if (room.photoDataUrls.length === before) {
        skipped.push({ reason: "duplicate_or_full", url });
      } else {
        applied.push({
          target: "room",
          targetId,
          label: room.name.trim() || "Room",
          url,
        });
      }
      continue;
    }

    if (placement.target === "bathroom") {
      const bath = sub.bathrooms.find((b) => b.id === targetId);
      if (!bath) {
        skipped.push({ reason: "unknown_bathroom", url });
        continue;
      }
      const before = bath.photoDataUrls.length;
      bath.photoDataUrls = appendUnique(bath.photoDataUrls, url, MAX_SLOT_PHOTOS);
      if (bath.photoDataUrls.length === before) {
        skipped.push({ reason: "duplicate_or_full", url });
      } else {
        applied.push({
          target: "bathroom",
          targetId,
          label: bath.name?.trim() || "Bathroom",
          url,
        });
      }
      continue;
    }

    if (placement.target === "shared_space") {
      const space = sub.sharedSpaces.find((s) => s.id === targetId);
      if (!space) {
        skipped.push({ reason: "unknown_shared_space", url });
        continue;
      }
      const before = space.photoDataUrls.length;
      space.photoDataUrls = appendUnique(space.photoDataUrls, url, MAX_SLOT_PHOTOS);
      if (space.photoDataUrls.length === before) {
        skipped.push({ reason: "duplicate_or_full", url });
      } else {
        applied.push({
          target: "shared_space",
          targetId,
          label: space.name?.trim() || space.spaceKind || "Shared space",
          url,
        });
      }
    }
  }

  return { submission: normalizeManagerListingSubmissionV1(sub), applied, skipped };
}

export type ListingMediaInventoryItem = { id: string; label: string; photoCount: number };

export type ListingMediaInventory = {
  rooms: ListingMediaInventoryItem[];
  bathrooms: ListingMediaInventoryItem[];
  sharedSpaces: ListingMediaInventoryItem[];
  housePhotoCount: number;
};

export function listingMediaInventoryFromSubmission(sub: ManagerListingSubmissionV1): ListingMediaInventory {
  const normalized = normalizeManagerListingSubmissionV1(sub);
  return {
    housePhotoCount: normalized.housePhotoDataUrls.length,
    rooms: normalized.rooms.map((r, i) => ({
      id: r.id,
      label: r.name.trim() || `Room ${i + 1}`,
      photoCount: r.photoDataUrls.length,
    })),
    bathrooms: normalized.bathrooms.map((b, i) => ({
      id: b.id,
      label: b.name?.trim() || `Bathroom ${i + 1}`,
      photoCount: b.photoDataUrls.length,
    })),
    sharedSpaces: normalized.sharedSpaces.map((s, i) => ({
      id: s.id,
      label: s.name?.trim() || s.spaceKind || `Shared space ${i + 1}`,
      photoCount: s.photoDataUrls.length,
    })),
  };
}
