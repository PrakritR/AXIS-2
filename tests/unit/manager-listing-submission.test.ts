import { describe, expect, it } from "vitest";
import {
  applyEntireHomeMonthlyRent,
  createDefaultListingSubmission,
  entireHomeMonthlyRentAmount,
  isEntireHomeListing,
  normalizeManagerListingSubmissionV1,
  resolveAllowedLeaseTerms,
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

  it("normalizes shared space kind from name when missing", () => {
    const sub = normalizeManagerListingSubmissionV1({
      ...createDefaultListingSubmission(),
      sharedSpaces: [
        {
          id: "ss-1",
          name: "Laundry room",
          location: "",
          detail: "",
          amenitiesText: "",
          photoDataUrls: [],
          videoDataUrl: null,
          roomAccessIds: [],
        },
      ],
    });
    expect(sub.sharedSpaces[0]?.spaceKind).toBe("laundry");
  });

  it("creates default submission with one empty room row", () => {
    const sub = createDefaultListingSubmission();
    expect(sub.v).toBe(1);
    expect(sub.listingPlaceCategoryId).toBe("shared_home");
    expect(sub.rooms).toHaveLength(1);
    expect(sub.rooms[0]?.name).toBe("");
  });

  it("resolves lease terms from body text when array is empty", () => {
    const sub = createDefaultListingSubmission();
    sub.allowedLeaseTerms = [];
    sub.leaseTermsBody = "Available lease lengths: 12-Month, Month-to-Month.";
    expect(resolveAllowedLeaseTerms(sub)).toEqual(expect.arrayContaining(["12-Month", "Month-to-Month"]));
  });
});
