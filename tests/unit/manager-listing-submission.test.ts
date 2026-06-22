import { describe, expect, it } from "vitest";
import { normalizeManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";

describe("manager-listing-submission", () => {
  it("normalizes minimal submission", () => {
    const sub = normalizeManagerListingSubmissionV1({
      v: 1,
      propertyName: "Test House",
      rooms: [],
      bathrooms: [],
      sharedSpaces: [],
      bundles: [],
      quickFacts: [],
    } as never);
    expect(sub.propertyName).toBe("Test House");
    expect(sub.rooms).toEqual([]);
  });
});
