import { describe, expect, it } from "vitest";
import { roomFurnishingIsFurnished } from "@/data/manager-listing-presets";
import { createDefaultListingSubmission, normalizeManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";

/**
 * The Rooms step now uses a "Furnished" checkbox (default off = unfurnished) instead of
 * an "Unfurnished" checkbox. This pins that the inversion did NOT flip the stored meaning.
 */
describe("room furnishing — Furnished checkbox derivation preserves stored meaning", () => {
  it("reads an existing furnished room (furniture list) as Furnished", () => {
    expect(roomFurnishingIsFurnished("Bed, Desk, Chair")).toBe(true);
  });

  it("reads an explicitly unfurnished room as NOT furnished", () => {
    expect(roomFurnishingIsFurnished("Unfurnished")).toBe(false);
    expect(roomFurnishingIsFurnished("unfurnished")).toBe(false);
  });

  it("defaults a new/empty room to unfurnished", () => {
    expect(roomFurnishingIsFurnished("")).toBe(false);
    expect(roomFurnishingIsFurnished(undefined)).toBe(false);
    // A brand-new listing's default room is unfurnished out of the box.
    const sub = createDefaultListingSubmission();
    expect(roomFurnishingIsFurnished(sub.rooms[0]!.furnishing)).toBe(false);
  });

  it("normalization does not rewrite a furnished room to unfurnished (or vice versa)", () => {
    const sub = createDefaultListingSubmission();
    sub.rooms = [{ ...sub.rooms[0]!, furnishing: "Bed, Desk" }, { ...sub.rooms[0]!, id: "r2", name: "R2", furnishing: "Unfurnished" }];
    const normalized = normalizeManagerListingSubmissionV1(sub);
    expect(roomFurnishingIsFurnished(normalized.rooms[0]!.furnishing)).toBe(true);
    expect(roomFurnishingIsFurnished(normalized.rooms[1]!.furnishing)).toBe(false);
  });
});
