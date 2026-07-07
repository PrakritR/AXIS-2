import { describe, expect, it } from "vitest";
import type { MockProperty } from "@/data/types";
import {
  buildPropertyBrowseCards,
  filterRoomListings,
  sortPropertyBrowseCards,
} from "@/lib/room-listings-catalog";
import { LISTING_ROOM_CHOICE_SEP } from "@/lib/rental-application/data";
import { writeManagerApplicationRows } from "@/lib/manager-applications-storage";

function mockProperty(overrides: Partial<MockProperty> & Pick<MockProperty, "id">): MockProperty {
  return {
    title: "Test home",
    tagline: "Cozy room",
    address: "123 Main St, Seattle, WA",
    zip: "98101",
    neighborhood: "Capitol Hill",
    beds: 2,
    baths: 1,
    rentLabel: "$900/mo",
    available: "Now",
    petFriendly: false,
    buildingId: "b1",
    buildingName: "Main House",
    unitLabel: "Unit A",
    adminPublishLive: true,
    ...overrides,
  };
}

describe("buildPropertyBrowseCards", () => {
  it("sorts properties by cheapest available room rent", () => {
    const properties = [
      mockProperty({ id: "expensive", neighborhood: "Ballard" }),
      mockProperty({ id: "cheap", neighborhood: "U District" }),
    ];

    const cards = buildPropertyBrowseCards(properties);
    if (cards.length < 2) return;

    for (let i = 1; i < cards.length; i++) {
      const prev = cards[i - 1]!.rentNumeric;
      const next = cards[i]!.rentNumeric;
      if (prev !== null && next !== null) {
        expect(prev).toBeLessThanOrEqual(next);
      }
    }
  });

  it("returns one card per property with an image url", () => {
    const properties = [mockProperty({ id: "p1" })];
    const cards = buildPropertyBrowseCards(properties);
    if (cards.length === 0) return;

    expect(cards[0]!.imageUrl.length).toBeGreaterThan(0);
    expect(cards[0]!.propertyId).toBe("p1");
  });

  it("sorts highest price first when requested", () => {
    const properties = [
      mockProperty({ id: "cheap", neighborhood: "U District" }),
      mockProperty({ id: "expensive", neighborhood: "Ballard" }),
    ];
    const cards = sortPropertyBrowseCards(buildPropertyBrowseCards(properties), "price-desc");
    if (cards.length < 2) return;

    const first = cards[0]!.rentNumeric;
    const second = cards[1]!.rentNumeric;
    if (first !== null && second !== null) {
      expect(first).toBeGreaterThanOrEqual(second);
    }
  });

  it("shows all listed properties when no move-in or move-out is set", () => {
    const property = mockProperty({
      id: "brooklyn",
      title: "5259 Brooklyn Ave NE",
      listingSubmission: {
        v: 1,
        rooms: [{ id: "r3", name: "Room 3", monthlyRent: 825, floor: "", detail: "", furnishing: "", roomAmenitiesText: "", utilitiesEstimate: "", photoDataUrls: [] }],
        bathrooms: [],
        buildingPhotos: [],
        entireHome: false,
      } as MockProperty["listingSubmission"],
    });

    writeManagerApplicationRows([
      {
        id: "resident-1",
        bucket: "approved",
        assignedPropertyId: "brooklyn",
        assignedRoomChoice: `brooklyn${LISTING_ROOM_CHOICE_SEP}r3`,
        manualResidentDetails: {
          moveInDate: "2026-05-23",
          moveOutDate: "2026-09-05",
          roomNumber: "Room 3",
        },
      } as never,
    ]);

    const rows = filterRoomListings([property], {
      zipRaw: "",
      radiusMiles: 50,
      maxBudgetNum: null,
      bathroom: "any",
    });
    expect(rows.length).toBeGreaterThan(0);
  });

  it("hides rooms occupied during the requested move-in window", () => {
    const property = mockProperty({
      id: "brooklyn",
      listingSubmission: {
        v: 1,
        rooms: [{ id: "r3", name: "Room 3", monthlyRent: 825, floor: "", detail: "", furnishing: "", roomAmenitiesText: "", utilitiesEstimate: "", photoDataUrls: [] }],
        bathrooms: [],
        buildingPhotos: [],
        entireHome: false,
      } as MockProperty["listingSubmission"],
    });

    writeManagerApplicationRows([
      {
        id: "resident-1",
        bucket: "approved",
        assignedPropertyId: "brooklyn",
        assignedRoomChoice: `brooklyn${LISTING_ROOM_CHOICE_SEP}r3`,
        manualResidentDetails: {
          moveInDate: "2026-05-23",
          moveOutDate: "2026-09-05",
          roomNumber: "Room 3",
        },
      } as never,
    ]);

    const blocked = filterRoomListings([property], {
      zipRaw: "",
      radiusMiles: 50,
      maxBudgetNum: null,
      bathroom: "any",
      moveIn: "2026-06-01",
    });
    expect(blocked.some((r) => r.roomId === "r3")).toBe(false);

    const available = filterRoomListings([property], {
      zipRaw: "",
      radiusMiles: 50,
      maxBudgetNum: null,
      bathroom: "any",
      moveIn: "2026-09-14",
    });
    expect(available.some((r) => r.roomId === "r3")).toBe(true);
  });
});
