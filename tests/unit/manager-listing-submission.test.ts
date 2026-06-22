import { describe, expect, it } from "vitest";
import {
  applyEntireHomeMonthlyRent,
  createDefaultListingSubmission,
  entireHomeMonthlyRentAmount,
  isEntireHomeListing,
  normalizeManagerListingSubmissionV1,
} from "@/lib/manager-listing-submission";

describe("manager-listing-submission", () => {
  it("normalizes minimal submission", () => {
    const sub = normalizeManagerListingSubmissionV1({
      v: 1,
      buildingName: "Test House",
      rooms: [],
      bathrooms: [],
      sharedSpaces: [],
      bundles: [],
      quickFacts: [],
    } as never);
    expect(sub.buildingName).toBe("Test House");
    expect(sub.rooms).toEqual([]);
  });

  it("detects entire-home listings and syncs one rent", () => {
    const base = createDefaultListingSubmission();
    const updated = applyEntireHomeMonthlyRent(
      {
        ...base,
        listingPlaceCategoryId: "entire_home",
        rooms: [
          { ...base.rooms[0]!, name: "Bedroom 1", monthlyRent: 900 },
          { ...base.rooms[1]!, name: "Bedroom 2", monthlyRent: 800 },
        ],
      },
      4500,
    );
    expect(isEntireHomeListing(updated)).toBe(true);
    expect(entireHomeMonthlyRentAmount(updated)).toBe(4500);
    expect(updated.rooms[0]?.monthlyRent).toBe(4500);
    expect(updated.rooms[1]?.monthlyRent).toBe(0);
  });
});
