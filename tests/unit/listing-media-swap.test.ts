import { describe, expect, it } from "vitest";
import { swapListingRoomMedia } from "@/lib/listing-media-copy";
import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";

function submissionWithRooms(
  rooms: Array<{ name: string; photoDataUrls: string[]; videoDataUrl?: string | null }>,
): ManagerListingSubmissionV1 {
  return {
    v: 1,
    buildingName: "Test",
    address: "Test",
    housePhotoDataUrls: [],
    rooms: rooms.map((room, index) => ({
      id: `room-${index + 1}`,
      name: room.name,
      floor: "",
      monthlyRent: 0,
      availability: "Available now",
      moveInAvailableDate: "",
      moveInInstructions: "",
      moveInPhotoDataUrls: [],
      moveInVideoDataUrl: null,
      manualUnavailableRanges: [],
      detail: "",
      furnishing: "",
      roomAmenitiesText: "",
      photoDataUrls: room.photoDataUrls,
      videoDataUrl: room.videoDataUrl ?? null,
    })),
    bathrooms: [],
    sharedSpaces: [],
  } as ManagerListingSubmissionV1;
}

describe("swapListingRoomMedia", () => {
  it("swaps photos and video between two named rooms", () => {
    const submission = submissionWithRooms([
      { name: "Room 1", photoDataUrls: ["https://example.test/r1.jpg"], videoDataUrl: "https://example.test/r1.mp4" },
      { name: "Room 9", photoDataUrls: ["https://example.test/r9a.jpg", "https://example.test/r9b.jpg"], videoDataUrl: "https://example.test/r9.mp4" },
    ]);

    const result = swapListingRoomMedia(submission, "Room 1", "Room 9");
    expect(result.swapped).toBe(true);
    expect(result.after.roomA.photoDataUrls).toEqual(["https://example.test/r9a.jpg", "https://example.test/r9b.jpg"]);
    expect(result.after.roomA.videoDataUrl).toBe("https://example.test/r9.mp4");
    expect(result.after.roomB.photoDataUrls).toEqual(["https://example.test/r1.jpg"]);
    expect(result.after.roomB.videoDataUrl).toBe("https://example.test/r1.mp4");
  });

  it("refuses when either room name is missing", () => {
    const submission = submissionWithRooms([{ name: "Room 1", photoDataUrls: ["a"] }]);
    const result = swapListingRoomMedia(submission, "Room 1", "Room 9");
    expect(result.swapped).toBe(false);
  });
});
