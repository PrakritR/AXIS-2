import { describe, expect, it } from "vitest";
import {
  applyListingStFeeAmount,
  applyListingStFeeToggle,
  deriveListingStFeeToggles,
  listingLtFeeFieldsRequired,
  readListingFeeCellAmount,
  validateListingStFeeToggles,
} from "@/lib/listing-fee-term-toggles";
import { createDefaultListingSubmission } from "@/lib/manager-listing-submission";
import { validateListingWizardStep } from "@/lib/listing-wizard-validation";

describe("listing fee term toggles", () => {
  it("derives ST toggles from stored submission amounts", () => {
    const sub = createDefaultListingSubmission();
    sub.shortTermDailyCost = "85";
    sub.applicationFee = "50";
    sub.shortTermDeposit = "";
    sub.shortTermMoveInFee = "0";

    expect(deriveListingStFeeToggles(sub)).toEqual({
      rent: true,
      applicationFee: true,
      securityDeposit: false,
      moveInFee: true,
    });
  });

  it("clears ST fields when toggled off", () => {
    const sub = createDefaultListingSubmission();
    sub.shortTermDailyCost = "120";
    sub.applicationFee = "40";

    const next = applyListingStFeeToggle(sub, "rent", false);
    expect(next.shortTermDailyCost).toBe("");
    expect(next.applicationFee).toBe("40");
  });

  it("maps ST rent amount to shortTermDailyCost", () => {
    const sub = createDefaultListingSubmission();
    const next = applyListingStFeeAmount(sub, "rent", "95");
    expect(next.shortTermDailyCost).toBe("95");
  });

  it("maps ST deposit amount to shortTermDeposit", () => {
    const sub = createDefaultListingSubmission();
    const next = applyListingStFeeAmount(sub, "securityDeposit", "500");
    expect(next.shortTermDeposit).toBe("500");
  });

  it("reads entire-home LT rent from entireHomeMonthlyRent", () => {
    const sub = createDefaultListingSubmission();
    sub.entireHomeMonthlyRent = 4500;
    expect(readListingFeeCellAmount(sub, "entireHomeMonthlyRent")).toBe("4500");
  });

  it("requires nightly rate only when ST rent toggle is on", () => {
    const sub = createDefaultListingSubmission();
    sub.shortTermRentalsAllowed = true;

    expect(validateListingStFeeToggles(sub, { ...deriveListingStFeeToggles(sub), rent: false }, true)).toEqual({});

    const errs = validateListingStFeeToggles(
      sub,
      { ...deriveListingStFeeToggles(sub), rent: true },
      true,
    );
    expect(errs.shortTermDailyCost).toMatch(/nightly/i);
  });

  it("lists LT-required fee fields when long-term is offered", () => {
    expect(listingLtFeeFieldsRequired(true)).toContain("securityDeposit");
    expect(listingLtFeeFieldsRequired(true)).toContain("moveInFee");
    expect(listingLtFeeFieldsRequired(false)).toEqual([]);
  });
});

describe("listing wizard ST fee validation integration", () => {
  function filledPricingSubmission() {
    const sub = createDefaultListingSubmission();
    sub.listingPlaceCategoryId = "by_room";
    sub.allowedLeaseTerms = ["12-Month"];
    sub.securityDeposit = "900";
    sub.moveInFee = "0";
    sub.parkingMonthly = "0";
    sub.hoaMonthly = "0";
    sub.otherMonthlyFees = "0";
    sub.monthToMonthSurcharge = "0";
    sub.rooms[0]!.monthlyRent = 900;
    return sub;
  }

  it("does not require ST nightly rate when ST rent toggle is off", () => {
    const sub = filledPricingSubmission();
    sub.shortTermRentalsAllowed = true;
    sub.shortTermDailyCost = "";

    const errs = validateListingWizardStep(4, sub, {
      stFeeToggles: { rent: false, applicationFee: false, securityDeposit: false, moveInFee: false },
    });
    expect(errs.shortTermDailyCost).toBeUndefined();
  });

  it("requires ST nightly rate when ST rent toggle is on", () => {
    const sub = filledPricingSubmission();
    sub.shortTermRentalsAllowed = true;
    sub.shortTermDailyCost = "";

    const errs = validateListingWizardStep(4, sub, {
      stFeeToggles: { rent: true, applicationFee: false, securityDeposit: false, moveInFee: false },
    });
    expect(errs.shortTermDailyCost).toMatch(/nightly/i);
  });
});
