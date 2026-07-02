import { describe, expect, it } from "vitest";
import type { MockProperty } from "@/data/types";
import { buildListingShareSummary } from "@/lib/listing-share-summary";

describe("buildListingShareSummary", () => {
  it("builds concise bullet facts for prospect emails", () => {
    const property: MockProperty = {
      id: "mgr-1",
      title: "Brooklyn House",
      tagline: "Bright rooms near UW",
      address: "5259 Brooklyn Ave NE",
      zip: "98105",
      neighborhood: "University District",
      beds: 5,
      baths: 2,
      rentLabel: "$950–$1,100/mo",
      available: "Jul 1",
      petFriendly: true,
      buildingId: "b1",
      buildingName: "Brooklyn House",
      unitLabel: "",
      adminPublishLive: true,
    };

    const summary = buildListingShareSummary(property);
    expect(summary.title).toBe("Brooklyn House");
    expect(summary.detailLines).toContain("5259 Brooklyn Ave NE · University District");
    expect(summary.detailLines).toContain("Rent: $950–$1,100/mo");
    expect(summary.detailLines).toContain("5 beds · 2 baths");
    expect(summary.detailLines).toContain("Available: Jul 1");
    expect(summary.detailLines).toContain("Pets welcome");
    expect(summary.detailLines).toContain("Bright rooms near UW");
  });

  it("uses the selected room rent without repeating property rent", () => {
    const property: MockProperty = {
      id: "mgr-rooms",
      title: "Brooklyn House",
      tagline: "",
      address: "5259 Brooklyn Ave NE",
      zip: "98105",
      neighborhood: "University District",
      beds: 5,
      baths: 2,
      rentLabel: "$1,500/mo",
      available: "Jul 1",
      petFriendly: true,
      buildingId: "b1",
      buildingName: "Brooklyn House",
      unitLabel: "",
      adminPublishLive: true,
      listingSubmission: {
        v: 1,
        buildingName: "Brooklyn House",
        address: "5259 Brooklyn Ave NE",
        zip: "98105",
        neighborhood: "University District",
        listingPlaceCategoryId: "private_room",
        tagline: "",
        petFriendly: true,
        houseOverview: "",
        houseRulesText: "",
        housePhotoDataUrls: [],
        leaseTermsBody: "",
        applicationFee: "",
        securityDeposit: "",
        moveInFee: "",
        paymentAtSigningIncludes: ["security_deposit", "move_in_fee"],
        houseCostsDetail: "",
        parkingMonthly: "",
        hoaMonthly: "",
        otherMonthlyFees: "",
        sharedSpaces: [],
        amenitiesText: "",
        rooms: [
          {
            id: "room-1",
            name: "Blue Room",
            floor: "upper",
            monthlyRent: 950,
            availability: "",
            moveInAvailableDate: "",
            moveInInstructions: "",
            manualUnavailableRanges: [],
            detail: "",
            furnishing: "",
            roomAmenitiesText: "",
            photoDataUrls: [],
            videoDataUrl: null,
            utilitiesEstimate: "",
          },
        ],
        bathrooms: [],
        bundles: [],
        quickFacts: [],
      } as MockProperty["listingSubmission"],
    };

    const summary = buildListingShareSummary(property, {
      roomChoice: "Blue Room · Upper floor · $950/mo",
      roomId: "room-1",
    });

    expect(summary.detailLines).toContain("Blue Room · $950/mo");
    expect(summary.detailLines).not.toContain("Rent: $1,500/mo");
    expect(summary.detailLines).not.toContain("Blue Room · Upper floor · $950/mo");
  });
});
