import { describe, expect, it } from "vitest";
import { buildManagerTourUrl } from "@/lib/manager-property-links";
import { buildPromotionDraftAutofill } from "@/lib/promotion-listing-context";
import type { MockProperty } from "@/data/types";

const sampleProperty: MockProperty = {
  id: "prop-123",
  title: "Sunset Apartments",
  buildingName: "Sunset Apartments",
  address: "123 Main St",
  neighborhood: "Capitol Hill",
  unitLabel: "Unit 2B",
  beds: 2,
  baths: 1,
  rentLabel: "$2,400/mo",
  available: "Now",
  petFriendly: true,
  tagline: "Bright 2BR near transit",
  listingSubmission: {
    amenitiesText: "In-unit laundry, parking",
    houseOverview: "Updated kitchen and hardwood floors.",
    rooms: [],
    bundles: [],
    leaseTermsBody: "",
    housePhotoDataUrls: [],
  },
};

describe("promotion scheduling link autofill", () => {
  it("includes tour URL when app origin is provided", () => {
    const draft = buildPromotionDraftAutofill(sampleProperty, {
      managerContact: "leasing@example.com",
      appOrigin: "https://app.example.com",
    });
    expect(draft.schedulingUrl).toBe("https://app.example.com/rent/tours-contact?propertyId=prop-123");
    expect(draft.includeSchedulingLink).toBe(true);
  });

  it("buildManagerTourUrl matches autofill origin", () => {
    expect(buildManagerTourUrl("https://app.example.com", "prop-123")).toBe(
      "https://app.example.com/rent/tours-contact?propertyId=prop-123",
    );
  });
});
