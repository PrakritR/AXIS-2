import type { ManagerRoomSubmission } from "@/lib/manager-listing-submission";
import { roomIsDailyPriced } from "@/lib/room-pricing";

export type RoomMediaTier = "incomplete" | "bronze" | "silver" | "gold";

export type RoomMediaScore = {
  tier: RoomMediaTier;
  photoCount: number;
  hasVideo: boolean;
  label: string;
  tone: "overdue" | "pending" | "info" | "confirmed";
};

export type PropertyMediaReadiness = {
  listedCount: number;
  readyCount: number;
  percentReady: number;
  roomScores: Array<{ roomId: string; roomName: string; score: RoomMediaScore }>;
};

/** Listed rooms included in property media readiness (name + rent). */
export function isListedRoomForMedia(room: ManagerRoomSubmission): boolean {
  if (!room.name.trim()) return false;
  return room.monthlyRent > 0 || roomIsDailyPriced(room);
}

export function scoreRoomMedia(input: {
  photoDataUrls?: string[] | null;
  videoDataUrl?: string | null;
}): RoomMediaScore {
  const photoCount = (input.photoDataUrls ?? []).filter((u) => u?.trim()).length;
  const hasVideo = Boolean(input.videoDataUrl?.trim());

  if (photoCount === 0 && !hasVideo) {
    return { tier: "incomplete", photoCount, hasVideo, label: "Add media", tone: "overdue" };
  }
  if (photoCount >= 3 && hasVideo) {
    return { tier: "gold", photoCount, hasVideo, label: "Gold", tone: "confirmed" };
  }
  if (photoCount >= 3) {
    return { tier: "silver", photoCount, hasVideo, label: "Silver", tone: "info" };
  }
  return { tier: "bronze", photoCount, hasVideo, label: "Bronze", tone: "pending" };
}

export function isRoomMediaReady(score: RoomMediaScore): boolean {
  return score.tier !== "incomplete";
}

export function summarizePropertyMediaReadiness(rooms: ManagerRoomSubmission[]): PropertyMediaReadiness {
  const listed = rooms.filter(isListedRoomForMedia);
  const roomScores = listed.map((room) => ({
    roomId: room.id,
    roomName: room.name.trim() || "Room",
    score: scoreRoomMedia(room),
  }));
  const readyCount = roomScores.filter((r) => isRoomMediaReady(r.score)).length;
  const listedCount = listed.length;
  const percentReady = listedCount === 0 ? 1 : readyCount / listedCount;
  return { listedCount, readyCount, percentReady, roomScores };
}

export const PROPERTY_MEDIA_READINESS_THRESHOLD = 0.7;

export function shouldWarnOnPublish(readiness: PropertyMediaReadiness): boolean {
  if (readiness.listedCount === 0) return false;
  return readiness.percentReady < PROPERTY_MEDIA_READINESS_THRESHOLD;
}

export function propertyMediaReadinessLabel(readiness: PropertyMediaReadiness): string {
  if (readiness.listedCount === 0) return "Add rooms to track media readiness";
  return `Media ready: ${readiness.readyCount} / ${readiness.listedCount} rooms`;
}
