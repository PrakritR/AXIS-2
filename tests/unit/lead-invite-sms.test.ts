import { describe, expect, it } from "vitest";
import { buildLeadInviteSmsText } from "@/lib/lead-invite-email";

describe("buildLeadInviteSmsText", () => {
  it("includes the browse link for multi-listing shares", () => {
    const text = buildLeadInviteSmsText({
      kind: "listing",
      propertyTitle: "3 homes",
      linkUrl: "https://prop-lane.space/rent/browse?ids=a,b",
      listingCount: 3,
    });
    expect(text).toContain("3 homes");
    expect(text).toContain("https://prop-lane.space/rent/browse?ids=a,b");
  });

  it("includes manager note when provided", () => {
    const text = buildLeadInviteSmsText({
      kind: "tour",
      propertyTitle: "Oak House",
      linkUrl: "https://prop-lane.space/rent/tours-contact?propertyId=x",
      managerNote: "Weekday afternoons work best.",
    });
    expect(text).toContain("Note: Weekday afternoons work best.");
  });
});
