import { describe, expect, it } from "vitest";
import type { MockProperty } from "@/data/types";
import { createDefaultListingSubmission } from "@/lib/manager-listing-submission";
import {
  enrichPromotionInputsFromListing,
  extractPromotionListingFacts,
  formatPromotionListingContext,
} from "@/lib/promotion-listing-context";
import { composeFallbackPromotionText } from "@/lib/promotion-text";
import type { PromotionInputs } from "@/lib/promotion-flyer";

const baseInputs: PromotionInputs = {
  headline: "",
  sellingPoints: "",
  price: "",
  promo: "",
  cta: "Schedule a tour",
  contact: "",
  tone: "Warm & welcoming",
  address: "",
  customDetails: "",
};

const listing: MockProperty = {
  id: "prop-1",
  title: "Furnished Rooms on Capitol Hill",
  tagline: "Bright furnished rooms near light rail",
  address: "123 Magnolia Ave, Seattle, WA",
  zip: "98102",
  neighborhood: "Capitol Hill",
  beds: 4,
  baths: 2,
  rentLabel: "From $950/mo",
  available: "Jul 1, 2026",
  petFriendly: false,
  buildingId: "b1",
  buildingName: "Magnolia House",
  unitLabel: "",
  listingSubmission: {
    ...createDefaultListingSubmission(),
    houseOverview: "Magnolia House offers furnished private rooms with shared kitchen and living space.",
    amenitiesText: "In-unit laundry\nHigh-speed Wi-Fi\nFurnished rooms",
    rooms: [
      {
        id: "r1",
        name: "Room A",
        floor: "2nd",
        monthlyRent: 950,
        availability: "Available now",
        detail: "",
        photoDataUrls: [],
        videoDataUrl: null,
        utilitiesEstimate: "",
        furnishing: "Furnished",
        roomAmenitiesText: "",
        moveInAvailableDate: "",
        moveInInstructions: "",
        prorateMethod: "auto",
      },
    ],
  },
};

describe("promotion-listing-context", () => {
  it("extracts listing facts from property record", () => {
    const facts = extractPromotionListingFacts(listing);
    expect(facts.propertyName).toBe("Magnolia House");
    expect(facts.neighborhood).toBe("Capitol Hill");
    expect(facts.overview).toContain("furnished private rooms");
    expect(facts.roomHighlights[0]).toContain("Room A");
  });

  it("enriches sparse promotion inputs without overwriting manager edits", () => {
    const enriched = enrichPromotionInputsFromListing(baseInputs, listing);
    expect(enriched.headline).toContain("Bright furnished");
    expect(enriched.price).toBe("From $950/mo");
    expect(enriched.customDetails).toContain("Magnolia House");
    expect(enriched.sellingPoints).toContain("4 bed · 2 bath");

    const withHeadline = enrichPromotionInputsFromListing({ ...baseInputs, headline: "Custom headline" }, listing);
    expect(withHeadline.headline).toBe("Custom headline");
  });

  it("formats listing context for AI prompts", () => {
    const ctx = formatPromotionListingContext(listing);
    expect(ctx).toContain("Magnolia House");
    expect(ctx).toContain("Capitol Hill");
    expect(ctx).toContain("Room A");
  });

  it("fallback listing blurb uses house overview", () => {
    const enriched = enrichPromotionInputsFromListing(baseInputs, listing);
    const copy = composeFallbackPromotionText(enriched, "Magnolia House — Capitol Hill", "listing_blurb");
    expect(copy.body).toContain("furnished private rooms");
    expect(copy.hook).toContain("Magnolia House");
  });
});
