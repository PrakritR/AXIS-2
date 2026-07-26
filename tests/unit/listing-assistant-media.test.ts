import { describe, expect, it } from "vitest";
import { buildListingModalAssistantContext } from "@/lib/listing-assistant-context";
import { applyListingPhotoPlacements } from "@/lib/listing-media-placement.server";
import { createDefaultListingSubmission, emptyBathroom, emptyRoom } from "@/lib/manager-listing-submission";

describe("buildListingModalAssistantContext", () => {
  it("includes property id and bathroom inventory for placement", () => {
    const sub = createDefaultListingSubmission();
    sub.bathrooms = [{ ...emptyBathroom(0), id: "bath-1", name: "Hall bath" }];
    const ctx = buildListingModalAssistantContext({
      wizardTitle: "Edit listing",
      stepLabel: "Bathrooms",
      propertyId: "mgr-test-1",
      submission: sub,
    });
    expect(ctx).toContain("propertyId=mgr-test-1");
    expect(ctx).toContain("bath-1:Hall bath");
    expect(ctx).toContain("apply_listing_photos");
  });
});

describe("applyListingPhotoPlacements", () => {
  it("places a photo on the matching bathroom", () => {
    const sub = createDefaultListingSubmission();
    const room = { ...emptyRoom(0), id: "room-1", name: "Bedroom A" };
    const bath = { ...emptyBathroom(0), id: "bath-1", name: "Primary bath" };
    sub.rooms = [room];
    sub.bathrooms = [bath];
    const url = "https://example.supabase.co/storage/v1/object/public/listing-photos/u/photo.jpg";
    const { submission, applied } = applyListingPhotoPlacements(sub, [
      { photoUrl: url, target: "bathroom", targetId: "bath-1" },
    ]);
    expect(applied).toHaveLength(1);
    expect(submission.bathrooms[0]?.photoDataUrls).toEqual([url]);
  });
});
