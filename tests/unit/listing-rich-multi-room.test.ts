import { describe, expect, it } from "vitest";
import type { MockProperty } from "@/data/types";
import { getListingRichContent } from "@/data/listing-rich-content";
import { listingRichFromManagerSubmission } from "@/data/listing-rich-from-submission";
import { createDefaultListingSubmission } from "@/lib/manager-listing-submission";

function mockProperty(overrides: Partial<MockProperty> & Pick<MockProperty, "id">): MockProperty {
  return {
    title: "Magnolia House",
    tagline: "Shared house",
    address: "1420 Magnolia Ave, Seattle, WA",
    zip: "98122",
    neighborhood: "Capitol Hill",
    beds: 5,
    baths: 2,
    rentLabel: "$1,050–$1,300 / mo",
    available: "Now",
    petFriendly: true,
    buildingId: "b1",
    buildingName: "Magnolia House",
    unitLabel: "5 rooms",
    adminPublishLive: true,
    ...overrides,
  };
}

describe("listing multi-room lease basics", () => {
  it("adds a two-or-more-rooms row to lease basics for shared listings", () => {
    const sub = createDefaultListingSubmission();
    sub.rooms = [
      { ...sub.rooms[0]!, id: "room-5", name: "Room 5", monthlyRent: 1050 },
      { ...sub.rooms[0]!, id: "room-4", name: "Room 4", monthlyRent: 1150 },
      { ...sub.rooms[0]!, id: "room-3", name: "Room 3", monthlyRent: 1200 },
    ];
    sub.bundles = [
      {
        id: "bundle-multi",
        label: "Two or more rooms",
        price: "$2,200/mo",
        strikethrough: "",
        promo: "Combine any two or more bedrooms on one lease.",
        roomsLine: "Example: Room 5 + Room 4",
        includedRoomIds: ["room-5", "room-4"],
      },
    ];

    const property = mockProperty({ id: "mgr-test-magnolia", listingSubmission: sub });
    const rich = listingRichFromManagerSubmission(property, sub);
    const leaseRow = rich.leaseBasics.find((row) => row.id === "lease-multi-room");

    expect(leaseRow?.title).toBe("Two or more rooms");
    expect(leaseRow?.price).toBe("$2,200/mo");
    expect(rich.bundleCards[0]?.label).toBe("Two or more rooms");
    expect(rich.bundleCards[0]?.price).toBe("$2,200/mo");
  });

  it("falls back to generated demo lease basics when no submission exists", () => {
    const rich = getListingRichContent(mockProperty({ id: "demo-only" }));
    expect(rich.leaseBasics.some((row) => row.id === "lease-multi-room")).toBe(true);
    expect(rich.bundleCards[0]?.label).toBe("Two or more rooms");
  });

  it("passes per-floor and property-wide floor plan URLs into floor cards", () => {
    const sub = createDefaultListingSubmission();
    sub.rooms = [
      { ...sub.rooms[0]!, id: "r1", name: "Room 1", floor: "1st / main floor", monthlyRent: 900 },
      { ...sub.rooms[0]!, id: "r2", name: "Room 2", floor: "2nd floor", monthlyRent: 950 },
    ];
    sub.floorPlanByLabel = {
      "1st / main floor": "data:image/png;base64,first-floor",
      "2nd floor": "data:image/png;base64,second-floor",
    };
    sub.propertyFloorPlanDataUrl = "data:image/png;base64,whole-house";

    const property = mockProperty({ id: "mgr-floor-plans", listingSubmission: sub });
    const rich = listingRichFromManagerSubmission(property, sub);

    const main = rich.floorPlans.find((f) => f.floorLabel === "1st / main floor");
    const upper = rich.floorPlans.find((f) => f.floorLabel === "2nd floor");
    expect(main?.floorPlanImageUrl).toBe("data:image/png;base64,first-floor");
    expect(upper?.floorPlanImageUrl).toBe("data:image/png;base64,second-floor");
    expect(main?.rooms[0]?.modal.bathroomShortLabel).toBeDefined();
  });

  it("uses property-wide floor plan when a floor has no dedicated upload", () => {
    const sub = createDefaultListingSubmission();
    sub.rooms = [{ ...sub.rooms[0]!, id: "r1", name: "Room 1", floor: "Loft / attic", monthlyRent: 800 }];
    sub.propertyFloorPlanDataUrl = "data:image/png;base64,property-wide";

    const property = mockProperty({ id: "mgr-floor-fallback", listingSubmission: sub });
    const rich = listingRichFromManagerSubmission(property, sub);

    expect(rich.floorPlans[0]?.floorPlanImageUrl).toBe("data:image/png;base64,property-wide");
  });

  it("groups floor plans by bedroom floor even when bathrooms assign cross-floor rooms", () => {
    const sub = createDefaultListingSubmission();
    sub.rooms = [
      { ...sub.rooms[0]!, id: "r5", name: "Room 5", floor: "3rd floor", monthlyRent: 775 },
      { ...sub.rooms[0]!, id: "r6", name: "Room 6", floor: "3rd floor", monthlyRent: 775 },
      { ...sub.rooms[0]!, id: "r7", name: "Room 7", floor: "3rd floor", monthlyRent: 775 },
      { ...sub.rooms[0]!, id: "r8", name: "Room 8", floor: "3rd floor", monthlyRent: 775 },
      { ...sub.rooms[0]!, id: "r9", name: "Room 9", floor: "1st / main floor", monthlyRent: 750 },
    ];
    sub.bathrooms = [
      {
        ...sub.bathrooms[0]!,
        id: "bath-4",
        name: "Bathroom 4",
        location: "Third Floor",
        assignedRoomIds: ["r5", "r6", "r7", "r8", "r9"],
      },
    ];

    const property = mockProperty({ id: "mgr-cross-floor", listingSubmission: sub });
    const rich = listingRichFromManagerSubmission(property, sub);

    expect(rich.floorPlansSectionTitle).toBeUndefined();
    expect(rich.floorPlans).toHaveLength(2);
    expect(rich.floorPlans[0]?.floorLabel).toBe("1st / main floor");
    expect(rich.floorPlans[0]?.rooms.map((r) => r.name)).toEqual(["Room 9"]);
    expect(rich.floorPlans[1]?.floorLabel).toBe("3rd floor");
    expect(rich.floorPlans[1]?.rooms.map((r) => r.name)).toEqual(["Room 5", "Room 6", "Room 7", "Room 8"]);
  });
});
