import { describe, expect, it } from "vitest";
import { buildRentalApplyHref } from "@/lib/rental-application/apply-from-listing";
import { buildManagerApplyUrl } from "@/lib/manager-property-links";
import { replyForIntent } from "@/lib/claw-leasing-bot.server";

describe("leasing apply link prefills", () => {
  it("includes phone + room on rental apply href", () => {
    const href = buildRentalApplyHref({
      propertyId: "prop-1",
      listingRoomId: "room-2",
      listingRoomName: "Room 2",
      phone: "+15551234567",
    });
    expect(href).toContain("propertyId=prop-1");
    expect(href).toContain("listingRoomId=room-2");
    expect(href).toContain("roomName=Room");
    expect(href).toContain("phone=%2B15551234567");
  });

  it("buildManagerApplyUrl passes phone through", () => {
    const url = buildManagerApplyUrl("https://example.com", {
      propertyId: "p1",
      phone: "+15550001111",
      roomName: "A",
    });
    expect(url).toContain("https://example.com/rent/apply?");
    expect(url).toContain("phone=%2B15550001111");
    expect(url).toContain("roomName=A");
  });

  it("replyForIntent apply path embeds prospect phone on apply URL", () => {
    const text = replyForIntent({
      intent: "apply",
      origin: "https://example.com",
      propertyId: "prop-9",
      propertyLabel: "Magnolia",
      phone: "+15559876543",
    });
    expect(text).toMatch(/apply/i);
    expect(text).toContain("phone=%2B15559876543");
  });
});
