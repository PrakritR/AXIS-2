import {
  normalizeManagerListingSubmissionV1,
  type ManagerListingSubmissionV1,
} from "@/lib/manager-listing-submission";

function matchByNameOrIndex<T extends { name: string }>(
  sourceItems: T[],
  targetName: string,
  index: number,
): T | undefined {
  const trimmed = targetName.trim().toLowerCase();
  if (trimmed) {
    const byName = sourceItems.find((item) => item.name.trim().toLowerCase() === trimmed);
    if (byName) return byName;
  }
  return sourceItems[index];
}

export type ListingMediaCopySummary = {
  housePhotos: number;
  roomsUpdated: number;
  bathroomsUpdated: number;
  sharedSpacesUpdated: number;
  copiedHouseVideo: boolean;
  copiedFloorPlan: boolean;
};

/**
 * Copy uploaded listing media URLs from one submission onto another without
 * duplicating storage objects (both listings reference the same public URLs).
 */
export function copyListingMediaBetweenSubmissions(
  source: ManagerListingSubmissionV1,
  target: ManagerListingSubmissionV1,
): { submission: ManagerListingSubmissionV1; summary: ListingMediaCopySummary } {
  const src = normalizeManagerListingSubmissionV1(source);
  const next = normalizeManagerListingSubmissionV1(target);

  next.housePhotoDataUrls = [...src.housePhotoDataUrls];
  next.houseVideoDataUrl = src.houseVideoDataUrl ?? null;
  next.propertyFloorPlanDataUrl = src.propertyFloorPlanDataUrl ?? null;
  next.floorPlanByLabel = src.floorPlanByLabel ? { ...src.floorPlanByLabel } : undefined;

  let roomsUpdated = 0;
  next.rooms = next.rooms.map((room, index) => {
    const srcRoom = matchByNameOrIndex(src.rooms, room.name, index);
    if (!srcRoom || (!srcRoom.photoDataUrls.length && !srcRoom.videoDataUrl)) return room;
    roomsUpdated += 1;
    return {
      ...room,
      photoDataUrls: [...srcRoom.photoDataUrls],
      videoDataUrl: srcRoom.videoDataUrl ?? null,
    };
  });

  let bathroomsUpdated = 0;
  next.bathrooms = next.bathrooms.map((bath, index) => {
    const srcBath = matchByNameOrIndex(src.bathrooms, bath.name, index);
    if (!srcBath || (!srcBath.photoDataUrls.length && !srcBath.videoDataUrl)) return bath;
    bathroomsUpdated += 1;
    return {
      ...bath,
      photoDataUrls: [...srcBath.photoDataUrls],
      videoDataUrl: srcBath.videoDataUrl ?? null,
    };
  });

  let sharedSpacesUpdated = 0;
  next.sharedSpaces = next.sharedSpaces.map((space, index) => {
    const srcSpace = matchByNameOrIndex(src.sharedSpaces, space.name, index);
    if (!srcSpace || (!srcSpace.photoDataUrls.length && !srcSpace.videoDataUrl)) return space;
    sharedSpacesUpdated += 1;
    return {
      ...space,
      photoDataUrls: [...srcSpace.photoDataUrls],
      videoDataUrl: srcSpace.videoDataUrl ?? null,
    };
  });

  return {
    submission: next,
    summary: {
      housePhotos: src.housePhotoDataUrls.length,
      roomsUpdated,
      bathroomsUpdated,
      sharedSpacesUpdated,
      copiedHouseVideo: Boolean(src.houseVideoDataUrl),
      copiedFloorPlan: Boolean(src.propertyFloorPlanDataUrl || Object.keys(src.floorPlanByLabel ?? {}).length),
    },
  };
}
