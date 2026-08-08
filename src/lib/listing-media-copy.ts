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

export type ListingRoomMediaSnapshot = {
  roomName: string;
  photoDataUrls: string[];
  videoDataUrl: string | null;
};

export type SwapListingRoomMediaResult = {
  submission: ManagerListingSubmissionV1;
  swapped: boolean;
  before: { roomA: ListingRoomMediaSnapshot; roomB: ListingRoomMediaSnapshot };
  after: { roomA: ListingRoomMediaSnapshot; roomB: ListingRoomMediaSnapshot };
};

function roomMediaSnapshot(room: { name: string; photoDataUrls: string[]; videoDataUrl?: string | null }): ListingRoomMediaSnapshot {
  return {
    roomName: room.name,
    photoDataUrls: [...room.photoDataUrls],
    videoDataUrl: room.videoDataUrl ?? null,
  };
}

function findRoomIndexByName(rooms: { name: string }[], roomName: string): number {
  const target = roomName.trim().toLowerCase();
  return rooms.findIndex((room) => room.name.trim().toLowerCase() === target);
}

/** Swap listing photos + video between two named rooms; leaves every other field untouched. */
export function swapListingRoomMedia(
  submission: ManagerListingSubmissionV1,
  roomNameA: string,
  roomNameB: string,
): SwapListingRoomMediaResult {
  const next = normalizeManagerListingSubmissionV1(submission);
  const idxA = findRoomIndexByName(next.rooms, roomNameA);
  const idxB = findRoomIndexByName(next.rooms, roomNameB);
  const roomA = idxA >= 0 ? next.rooms[idxA]! : null;
  const roomB = idxB >= 0 ? next.rooms[idxB]! : null;
  const emptySnapshot = (name: string): ListingRoomMediaSnapshot => ({
    roomName: name,
    photoDataUrls: [],
    videoDataUrl: null,
  });

  if (!roomA || !roomB || idxA === idxB) {
    return {
      submission: next,
      swapped: false,
      before: { roomA: roomA ? roomMediaSnapshot(roomA) : emptySnapshot(roomNameA), roomB: roomB ? roomMediaSnapshot(roomB) : emptySnapshot(roomNameB) },
      after: { roomA: roomA ? roomMediaSnapshot(roomA) : emptySnapshot(roomNameA), roomB: roomB ? roomMediaSnapshot(roomB) : emptySnapshot(roomNameB) },
    };
  }

  const before = { roomA: roomMediaSnapshot(roomA), roomB: roomMediaSnapshot(roomB) };
  const photosA = [...roomA.photoDataUrls];
  const videoA = roomA.videoDataUrl ?? null;
  const photosB = [...roomB.photoDataUrls];
  const videoB = roomB.videoDataUrl ?? null;

  next.rooms = next.rooms.map((room, index) => {
    if (index === idxA) return { ...room, photoDataUrls: photosB, videoDataUrl: videoB };
    if (index === idxB) return { ...room, photoDataUrls: photosA, videoDataUrl: videoA };
    return room;
  });

  const afterRoomA = next.rooms[idxA]!;
  const afterRoomB = next.rooms[idxB]!;
  return {
    submission: next,
    swapped: true,
    before,
    after: { roomA: roomMediaSnapshot(afterRoomA), roomB: roomMediaSnapshot(afterRoomB) },
  };
}
