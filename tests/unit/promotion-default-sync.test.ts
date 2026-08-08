import { describe, expect, it } from "vitest";
import type { MockProperty } from "@/data/types";
import {
  addDefaultPromotionPreset,
  defaultPromotionFlyerEntryId,
  defaultPromotionTextEntryId,
  ensureDefaultPromotionAssets,
  isSystemOwnedPromotionEntryId,
  missingPromotionPresets,
} from "@/lib/promotion-default-sync";
import { readFlyerEntries } from "@/lib/promotion-flyer";
import { readPromotionTextEntries } from "@/lib/promotion-text";

const PROPERTY_ID = "mgr-lakeview-1";

function sampleProperty(): MockProperty {
  return {
    id: PROPERTY_ID,
    title: "Lakeview Studio",
    buildingName: "Lakeview Studio",
    address: "2100 Westlake Ave N",
    neighborhood: "South Lake Union",
    rentLabel: "$1,800 / mo",
    beds: 1,
    baths: 1,
    tagline: "Sun-filled studio with water views",
    listingSubmission: {
      houseOverview: "Bright open layout with in-unit laundry and fast Wi-Fi.",
      amenitiesText: "In-unit laundry\nFast Wi-Fi\nPet friendly",
      rooms: [{ name: "Studio", monthlyRent: 1800, availability: "Available now" }],
    },
  } as MockProperty;
}

describe("promotion-default-sync", () => {
  it("seeds a default flyer and listing blurb from listing facts", () => {
    const row = ensureDefaultPromotionAssets({
      propertyId: PROPERTY_ID,
      property: sampleProperty(),
      managerUserId: "mgr-user-1",
      managerContact: "leasing@example.com",
      appOrigin: "https://prop-lane.space",
    });
    expect(row).not.toBeNull();
    const flyers = readFlyerEntries(row!);
    const texts = readPromotionTextEntries(row!);
    expect(flyers).toHaveLength(1);
    expect(texts).toHaveLength(1);
    expect(flyers[0]?.id).toBe(defaultPromotionFlyerEntryId(PROPERTY_ID));
    expect(texts[0]?.id).toBe(defaultPromotionTextEntryId(PROPERTY_ID));
    expect(flyers[0]?.copy.headline).toContain("Sun-filled");
    expect(texts[0]?.copy.format).toBe("listing_blurb");
    expect(texts[0]?.copy.body).toMatch(/laundry|Wi-Fi/i);
    expect(row?.status).toBe("generated");
  });

  it("returns null when both default seeds already exist", () => {
    const first = ensureDefaultPromotionAssets({
      propertyId: PROPERTY_ID,
      property: sampleProperty(),
      managerUserId: "mgr-user-1",
    });
    const second = ensureDefaultPromotionAssets({
      propertyId: PROPERTY_ID,
      property: sampleProperty(),
      managerUserId: "mgr-user-1",
      existingRow: first,
    });
    expect(second).toBeNull();
  });

  it("fills only the missing default when one seed exists", () => {
    const withFlyerOnly = ensureDefaultPromotionAssets({
      propertyId: PROPERTY_ID,
      property: sampleProperty(),
      managerUserId: "mgr-user-1",
    });
    const flyers = readFlyerEntries(withFlyerOnly!);
    const patched = {
      ...withFlyerOnly!,
      flyerCopies: flyers,
      textCopies: [],
      textCopy: null,
    };
    const filled = ensureDefaultPromotionAssets({
      propertyId: PROPERTY_ID,
      property: sampleProperty(),
      managerUserId: "mgr-user-1",
      existingRow: patched,
    });
    expect(filled).not.toBeNull();
    expect(readFlyerEntries(filled!)).toHaveLength(1);
    expect(readPromotionTextEntries(filled!)).toHaveLength(1);
  });

  it("refreshes the default flyer when listing photos change", () => {
    const listingUrl =
      "https://project.supabase.co/storage/v1/object/public/listing-photos/mgr/u/house.jpg";
    const property = sampleProperty();
    property.listingSubmission = {
      ...property.listingSubmission!,
      housePhotoDataUrls: [listingUrl],
    };
    const first = ensureDefaultPromotionAssets({
      propertyId: PROPERTY_ID,
      property,
      managerUserId: "mgr-user-1",
    });
    expect(readFlyerEntries(first!)[0]?.inputs.images).toEqual([listingUrl]);

    const updatedUrl =
      "https://project.supabase.co/storage/v1/object/public/listing-photos/mgr/u/house-new.jpg";
    property.listingSubmission = {
      ...property.listingSubmission!,
      housePhotoDataUrls: [updatedUrl],
    };
    const second = ensureDefaultPromotionAssets({
      propertyId: PROPERTY_ID,
      property,
      managerUserId: "mgr-user-1",
      existingRow: first,
    });
    expect(second).not.toBeNull();
    expect(readFlyerEntries(second!)[0]?.inputs.images).toEqual([updatedUrl]);
  });

  it("adds a single preset on demand without creating the other", () => {
    const flyerOnly = addDefaultPromotionPreset({
      propertyId: PROPERTY_ID,
      property: sampleProperty(),
      managerUserId: "mgr-user-1",
      preset: "default_flyer",
    });
    expect(flyerOnly).not.toBeNull();
    expect(readFlyerEntries(flyerOnly!)).toHaveLength(1);
    expect(readPromotionTextEntries(flyerOnly!)).toHaveLength(0);

    const textOnly = addDefaultPromotionPreset({
      propertyId: PROPERTY_ID,
      property: sampleProperty(),
      managerUserId: "mgr-user-1",
      existingRow: flyerOnly,
      preset: "default_listing_blurb",
    });
    expect(textOnly).not.toBeNull();
    expect(readFlyerEntries(textOnly!)).toHaveLength(1);
    expect(readPromotionTextEntries(textOnly!)).toHaveLength(1);
  });

  it("reports missing presets for the suggestions list", () => {
    expect(missingPromotionPresets(PROPERTY_ID, null)).toEqual(["default_flyer", "default_listing_blurb"]);
    const withFlyer = addDefaultPromotionPreset({
      propertyId: PROPERTY_ID,
      property: sampleProperty(),
      managerUserId: "mgr-user-1",
      preset: "default_flyer",
    });
    expect(missingPromotionPresets(PROPERTY_ID, withFlyer)).toEqual(["default_listing_blurb"]);
  });

  it("flags system-owned seed entry ids", () => {
    expect(isSystemOwnedPromotionEntryId(defaultPromotionFlyerEntryId(PROPERTY_ID))).toBe(true);
    expect(isSystemOwnedPromotionEntryId(defaultPromotionTextEntryId(PROPERTY_ID))).toBe(true);
    expect(isSystemOwnedPromotionEntryId("custom-flyer-entry")).toBe(false);
  });
});
