import { describe, expect, it } from "vitest";
import { getListingRichContent } from "@/data/listing-rich-content";
import type { MockProperty } from "@/data/types";
import { collectPropertyMediaSlides, formatRoomListingSubtitle } from "@/lib/room-listings-catalog";
import type { ListingRoomRow } from "@/data/listing-rich-content";

describe("collectPropertyMediaSlides", () => {
  it("includes photos from all rooms on the listing in order", () => {
    const property = {
      id: "prop-1",
      address: "123 Main St",
      zip: "98105",
      neighborhood: "University District",
      beds: 3,
      baths: 2,
      tagline: "Shared housing",
      rentLabel: "$800/mo",
      buildingName: "Test House",
      unitLabel: "Unit A",
    } as MockProperty;

    const rich = getListingRichContent(property);
    rich.floorPlans = [
      {
        floorLabel: "First floor",
        fromPrice: "$800",
        roomCount: 3,
        rooms: [
          {
            id: "r1",
            name: "Room 1",
            detail: "",
            price: "$800/month",
            availability: "Available now",
            modal: { setupLine: "", tourEyebrow: "", tourTitle: "", tourSubtitle: "", includedTags: [], photoUrls: ["https://example.com/r1.jpg"] },
          },
          {
            id: "r2",
            name: "Room 2",
            detail: "",
            price: "$850/month",
            availability: "Available now",
            modal: { setupLine: "", tourEyebrow: "", tourTitle: "", tourSubtitle: "", includedTags: [], photoUrls: ["https://example.com/r2-a.jpg", "https://example.com/r2-b.jpg"] },
          },
          {
            id: "r3",
            name: "Room 3",
            detail: "",
            price: "$875/month",
            availability: "Available now",
            modal: { setupLine: "", tourEyebrow: "", tourTitle: "", tourSubtitle: "", includedTags: [] },
          },
        ],
      },
    ];

    const slides = collectPropertyMediaSlides(rich);

    expect(slides.map((s) => s.roomName)).toEqual(["Room 1", "Room 2", "Room 2"]);
    expect(slides.map((s) => s.src)).toEqual([
      "https://example.com/r1.jpg",
      "https://example.com/r2-a.jpg",
      "https://example.com/r2-b.jpg",
    ]);
  });

  it("falls back to house hero photos when no room media exists", () => {
    const property = {
      id: "prop-2",
      address: "456 Oak Ave",
      zip: "98105",
      neighborhood: "University District",
      beds: 2,
      baths: 1,
      tagline: "Shared housing",
      rentLabel: "$700/mo",
      buildingName: "Oak House",
      unitLabel: "Unit B",
    } as MockProperty;

    const rich = getListingRichContent(property);
    rich.heroHousePhotoUrls = ["https://example.com/house.jpg"];

    const slides = collectPropertyMediaSlides(rich);

    expect(slides).toEqual([{ roomName: "House", kind: "photo", src: "https://example.com/house.jpg" }]);
  });
});

describe("formatRoomListingSubtitle", () => {
  const baseRoom = (overrides: Partial<ListingRoomRow> = {}): ListingRoomRow => ({
    id: "r1",
    name: "Room 1",
    detail: "",
    price: "$800/month",
    availability: "Available now",
    modal: {
      setupLine: "",
      tourEyebrow: "",
      tourTitle: "",
      tourSubtitle: "",
      includedTags: [],
    },
    ...overrides,
  });

  it("turns bathroom grouping labels into a friendly floor line", () => {
    expect(
      formatRoomListingSubtitle({
        floorLabel: "Bathroom 3 · Second Floor",
        room: baseRoom(),
        neighborhood: "University District",
      }),
    ).toBe("Second Floor bedroom · University District");
  });

  it("prefers the room floor field when present", () => {
    expect(
      formatRoomListingSubtitle({
        floorLabel: "Bathroom 3 · Second Floor",
        room: baseRoom({ modal: { ...baseRoom().modal, floorLine: "third floor" } }),
        neighborhood: "Capitol Hill",
      }),
    ).toBe("Third Floor bedroom · Capitol Hill");
  });

  it("avoids repeating the room name", () => {
    const subtitle = formatRoomListingSubtitle({
      floorLabel: "Second floor",
      room: baseRoom({ name: "Room 10" }),
      neighborhood: "University District",
    });
    expect(subtitle).not.toContain("Room 10");
    expect(subtitle).toBe("Second Floor bedroom · University District");
  });
});
