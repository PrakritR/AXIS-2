import { describe, expect, it } from "vitest";
import { deriveListingLtFeeToggles } from "@/lib/listing-fee-term-toggles";
import { createDefaultListingSubmission, emptyRoom } from "@/lib/manager-listing-submission";
import {
  buildListingStepFieldOrder,
  listingRoomNameKey,
  listingRoomRentKey,
  validateListingWizardStep,
} from "@/lib/listing-wizard-validation";

describe("validateListingWizardStep", () => {
  it("does not require room names on step 1 (autofilled later)", () => {
    const sub = createDefaultListingSubmission();
    sub.rooms = [{ ...emptyRoom(0), id: "r1", name: "" }];
    const errs = validateListingWizardStep(1, sub);
    expect(errs[listingRoomNameKey("r1")]).toBeUndefined();
    expect(errs.rooms).toBeUndefined();
  });

  it("flags per-room rent on pricing step when long-term leases are offered", () => {
    const sub = createDefaultListingSubmission();
    sub.listingPlaceCategoryId = "shared_home";
    sub.allowedLeaseTerms = ["12-Month"];
    sub.rooms = [{ ...emptyRoom(0), id: "r1", name: "Room A", monthlyRent: 0 }];
    const errs = validateListingWizardStep(4, sub, {
      entireHomeRent: 0,
      ltFeeToggles: { ...deriveListingLtFeeToggles(sub), rent: true },
    });
    expect(errs[listingRoomRentKey("r1")]).toBeUndefined();
    expect(errs.monthlyRent).toMatch(/rent/i);
  });

  it("does not require lease bundles for entire-home listings", () => {
    const sub = createDefaultListingSubmission();
    sub.listingPlaceCategoryId = "entire_home";
    sub.allowedLeaseTerms = ["12-Month"];
    sub.entireHomeMonthlyRent = 4500;
    sub.rooms = [{ ...emptyRoom(0), id: "r1", name: "Bedroom 1", monthlyRent: 4500 }];
    sub.securityDeposit = "0";
    sub.moveInFee = "0";
    sub.parkingMonthly = "0";
    sub.hoaMonthly = "0";
    sub.otherMonthlyFees = "0";
    sub.monthToMonthSurcharge = "0";
    sub.bundles = [];
    const errs = validateListingWizardStep(4, sub, { entireHomeRent: 4500 });
    expect(Object.keys(errs)).toEqual([]);
  });

  it("orders room name keys before summary on step 1", () => {
    const sub = createDefaultListingSubmission();
    sub.rooms = [{ ...emptyRoom(0), id: "r1", name: "" }];
    const order = buildListingStepFieldOrder(1, sub);
    expect(order[0]).toBe(listingRoomNameKey("r1"));
  });
});
