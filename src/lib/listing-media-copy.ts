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

function mapRoomAccessIds(
  sourceIds: string[],
  sourceRooms: { id: string; name: string }[],
  targetRooms: { id: string; name: string }[],
): string[] {
  const mapped = sourceIds
    .map((sourceId) => {
      const sourceRoom = sourceRooms.find((room) => room.id === sourceId);
      if (!sourceRoom) return null;
      const byName = targetRooms.find(
        (room) => room.name.trim().toLowerCase() === sourceRoom.name.trim().toLowerCase(),
      );
      if (byName) return byName.id;
      const sourceIndex = sourceRooms.findIndex((room) => room.id === sourceId);
      return sourceIndex >= 0 ? targetRooms[sourceIndex]?.id ?? null : null;
    })
    .filter((id): id is string => Boolean(id));
  return mapped.length > 0 ? [...new Set(mapped)] : targetRooms.map((room) => room.id);
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
  const nextSharedSpaces = [...next.sharedSpaces];
  for (let index = 0; index < src.sharedSpaces.length; index += 1) {
    const srcSpace = src.sharedSpaces[index]!;
    if (!srcSpace.photoDataUrls.length && !srcSpace.videoDataUrl) continue;

    const byNameIndex = nextSharedSpaces.findIndex(
      (space) => space.name.trim().toLowerCase() === srcSpace.name.trim().toLowerCase(),
    );
    const byKindIndex =
      srcSpace.spaceKind != null
        ? nextSharedSpaces.findIndex((space) => space.spaceKind === srcSpace.spaceKind)
        : -1;
    const targetIndex = byNameIndex >= 0 ? byNameIndex : byKindIndex >= 0 ? byKindIndex : index;
    const existing = nextSharedSpaces[targetIndex];

    if (existing) {
      nextSharedSpaces[targetIndex] = {
        ...existing,
        photoDataUrls: [...srcSpace.photoDataUrls],
        videoDataUrl: srcSpace.videoDataUrl ?? null,
      };
    } else {
      nextSharedSpaces.push({
        ...srcSpace,
        photoDataUrls: [...srcSpace.photoDataUrls],
        videoDataUrl: srcSpace.videoDataUrl ?? null,
        roomAccessIds: mapRoomAccessIds(srcSpace.roomAccessIds ?? [], src.rooms, next.rooms),
      });
    }
    sharedSpacesUpdated += 1;
  }
  next.sharedSpaces = nextSharedSpaces;

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
