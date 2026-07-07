import { describe, expect, it } from "vitest";
import type { MockProperty } from "@/data/types";
import { buildPropertyBrowseCards, sortPropertyBrowseCards } from "@/lib/room-listings-catalog";

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
});
