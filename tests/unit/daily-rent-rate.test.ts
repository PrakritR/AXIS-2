import { describe, expect, it } from "vitest";
import type { MockProperty } from "@/data/types";
import { createDefaultListingSubmission, normalizeManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import { buildPropertyBrowseCards } from "@/lib/room-listings-catalog";
import { listingRichFromManagerSubmission } from "@/data/listing-rich-from-submission";

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

function dailyRoomSub() {
  const sub = createDefaultListingSubmission();
  sub.rooms = [
    { ...sub.rooms[0]!, id: "r1", name: "Room 1", monthlyRent: 0, rentBasis: "daily", dailyRentPrice: 40 },
  ];
  return sub;
}

describe("daily rent rate — persistence & normalization", () => {
  it("preserves rentBasis + dailyRentPrice through normalization", () => {
    const normalized = normalizeManagerListingSubmissionV1(dailyRoomSub());
    expect(normalized.rooms[0]!.rentBasis).toBe("daily");
    expect(normalized.rooms[0]!.dailyRentPrice).toBe(40);
  });

  it("downgrades rentBasis=daily to monthly when no positive daily price is set", () => {
    const sub = createDefaultListingSubmission();
    sub.rooms = [{ ...sub.rooms[0]!, id: "r1", name: "Room 1", monthlyRent: 800, rentBasis: "daily", dailyRentPrice: 0 }];
    const normalized = normalizeManagerListingSubmissionV1(sub);
    expect(normalized.rooms[0]!.rentBasis).toBe("monthly");
  });

  it("leaves a plain monthly room untouched (no rentBasis becomes monthly)", () => {
    const sub = createDefaultListingSubmission();
    sub.rooms = [{ ...sub.rooms[0]!, id: "r1", name: "Room 1", monthlyRent: 825 }];
    const normalized = normalizeManagerListingSubmissionV1(sub);
    expect(normalized.rooms[0]!.rentBasis).toBe("monthly");
    expect(normalized.rooms[0]!.dailyRentPrice).toBeUndefined();
  });
});

describe("daily rent rate — browse cards", () => {
  it("shows a daily headline + period, with a monthly-equivalent for sorting", () => {
    const property = mockProperty({ id: "mgr-daily-1", listingSubmission: dailyRoomSub() });
    const cards = buildPropertyBrowseCards([property]);
    expect(cards).toHaveLength(1);
    const card = cards[0]!;
    expect(card.pricePeriod).toBe("day");
    expect(card.headlineRent).toBe(40);
    // rentNumeric is the monthly-equivalent (40 × 30) so budget filters/sorting stay sane.
    expect(card.rentNumeric).toBe(1200);
    expect(card.priceLabel).toContain("/day");
  });

  it("keeps a monthly room's card as month period", () => {
    const sub = createDefaultListingSubmission();
    sub.rooms = [{ ...sub.rooms[0]!, id: "r1", name: "Room 1", monthlyRent: 825 }];
    const property = mockProperty({ id: "mgr-monthly-1", listingSubmission: sub });
    const cards = buildPropertyBrowseCards([property]);
    expect(cards[0]!.pricePeriod).toBe("month");
    expect(cards[0]!.headlineRent).toBe(825);
  });
});

describe("daily rent rate — listing rich content", () => {
  it("renders the room price as $X/day", () => {
    const property = mockProperty({ id: "mgr-daily-2", listingSubmission: dailyRoomSub() });
    const rich = listingRichFromManagerSubmission(property, dailyRoomSub());
    const allRooms = rich.floorPlans.flatMap((f) => f.rooms);
    const room = allRooms.find((r) => r.id === "r1");
    expect(room?.price).toBe("$40/day");
    expect(room?.pricePeriod).toBe("day");
  });
});
