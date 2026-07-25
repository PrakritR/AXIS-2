import { describe, expect, it } from "vitest";
import { copyListingMediaBetweenSubmissions } from "@/lib/listing-media-copy";
import { createDefaultListingSubmission } from "@/lib/manager-listing-submission";

describe("copyListingMediaBetweenSubmissions", () => {
  it("copies house and matched room photos by name", () => {
    const source = createDefaultListingSubmission();
    source.housePhotoDataUrls = ["https://x.test/house1.jpg", "https://x.test/house2.jpg"];
    source.rooms[0]!.name = "Bedroom A";
    source.rooms[0]!.photoDataUrls = ["https://x.test/room-a.jpg"];

    const target = createDefaultListingSubmission();
    target.rooms[0]!.name = "Bedroom A";
    target.rooms[0]!.photoDataUrls = [];

    const { submission, summary } = copyListingMediaBetweenSubmissions(source, target);
    expect(submission.housePhotoDataUrls).toEqual(source.housePhotoDataUrls);
    expect(submission.rooms[0]!.photoDataUrls).toEqual(["https://x.test/room-a.jpg"]);
    expect(summary.housePhotos).toBe(2);
    expect(summary.roomsUpdated).toBe(1);
  });
});
