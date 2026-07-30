import { describe, expect, it } from "vitest";
import {
  createDefaultListingSubmission,
  isEntireHomeListing,
  normalizeManagerListingSubmissionV1,
  stampRentalModel,
} from "@/lib/manager-listing-submission";

/**
 * Migration-first stamp for the rental-model removal. Step 1 only: the stamp is recorded
 * as durable data but is DORMANT — it must not change any behavior yet.
 */
describe("rental model stamp — migration first, dormant", () => {
  it("stamps the current model from listingPlaceCategoryId", () => {
    expect(stampRentalModel({ listingPlaceCategoryId: "entire_home" })).toEqual({ model: "entire_home", inferred: false });
    expect(stampRentalModel({ listingPlaceCategoryId: "shared_home" })).toEqual({ model: "shared_home", inferred: false });
  });

  it("flags only a truly MISSING model as inferred", () => {
    expect(stampRentalModel({ listingPlaceCategoryId: undefined })).toEqual({ model: "shared_home", inferred: true });
    expect(stampRentalModel({ listingPlaceCategoryId: "  " })).toEqual({ model: "shared_home", inferred: true });
  });

  it("maps a legacy stored value (private_room) to shared-home, matching today's behavior — not inferred", () => {
    // The dev data still carries `private_room`; isEntireHomeListing already treats it as
    // shared-home (=== entire_home is false), so the stamp mirrors that deterministically.
    expect(stampRentalModel({ listingPlaceCategoryId: "private_room" })).toEqual({ model: "shared_home", inferred: false });
    expect(isEntireHomeListing({ listingPlaceCategoryId: "private_room" })).toBe(false);
  });

  it("is idempotent — an already-stamped listing keeps its stamp, even if the source disagrees", () => {
    // A stamped entire_home must not be re-inferred to shared_home even if the source is cleared.
    expect(
      stampRentalModel({ listingPlaceCategoryId: undefined, rentalModelStamp: "entire_home" }),
    ).toEqual({ model: "entire_home", inferred: false });
  });

  it("normalization records the stamp without changing behavior (isEntireHomeListing unchanged)", () => {
    const entire = normalizeManagerListingSubmissionV1({ ...createDefaultListingSubmission(), listingPlaceCategoryId: "entire_home" });
    expect(entire.rentalModelStamp).toBe("entire_home");
    expect(isEntireHomeListing(entire)).toBe(true); // still driven by listingPlaceCategoryId — dormant stamp

    const shared = normalizeManagerListingSubmissionV1({ ...createDefaultListingSubmission(), listingPlaceCategoryId: "shared_home" });
    expect(shared.rentalModelStamp).toBe("shared_home");
    expect(isEntireHomeListing(shared)).toBe(false);

    // Re-normalizing keeps the stamp (idempotent) even if the source is later blanked.
    const restamped = normalizeManagerListingSubmissionV1({ ...entire, listingPlaceCategoryId: "" });
    expect(restamped.rentalModelStamp).toBe("entire_home");
  });
});
