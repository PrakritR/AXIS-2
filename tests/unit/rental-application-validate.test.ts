import { describe, expect, it } from "vitest";
import { createDefaultListingSubmission } from "@/lib/manager-listing-submission";
import { createInitialRentalWizardState } from "@/lib/rental-application/state";
import { validateRentalWizardStep } from "@/lib/rental-application/validate";

describe("rental-application validate", () => {
  it("requires group choice on step 1", () => {
    const state = createInitialRentalWizardState();
    const errors = validateRentalWizardStep(1, state);
    expect(errors.applyingAsGroup).toBeDefined();
  });

  it("passes step 1 when not applying as group", () => {
    const state = { ...createInitialRentalWizardState(), applyingAsGroup: "no" as const };
    expect(validateRentalWizardStep(1, state)).toEqual({});
  });

  it("requires cosigner choice on step 2", () => {
    const state = createInitialRentalWizardState();
    const errors = validateRentalWizardStep(2, state);
    expect(errors.hasCosigner).toBeDefined();
  });

  it("requires check payment confirmation for Zelle application fees on step 12", () => {
    const sub = {
      ...createDefaultListingSubmission(),
      applicationFee: "$50",
      applicationFeeChannels: ["zelle"] as const,
      zellePaymentsEnabled: true,
      zelleContact: "pay@example.com",
    };
    const state = {
      ...createInitialRentalWizardState(),
      propertyId: "prop-zelle",
      applicationFeePayChannel: "zelle" as const,
      applicationFeeZelleSentConfirmed: false,
    };
    const errors = validateRentalWizardStep(12, state, {
      property: { id: "prop-zelle", listingSubmission: sub },
    });
    expect(errors.applicationFeeZelleSentConfirmed).toContain("Check payment");
  });

  it("passes step 12 when manual application fee is verified", () => {
    const sub = {
      ...createDefaultListingSubmission(),
      applicationFee: "$50",
      applicationFeeChannels: ["venmo"] as const,
      venmoPaymentsEnabled: true,
      venmoContact: "@landlord",
    };
    const state = {
      ...createInitialRentalWizardState(),
      propertyId: "prop-venmo",
      applicationFeePayChannel: "venmo" as const,
      applicationFeeZelleSentConfirmed: true,
    };
    const errors = validateRentalWizardStep(12, state, {
      property: { id: "prop-venmo", listingSubmission: sub },
    });
    expect(errors.applicationFeeZelleSentConfirmed).toBeUndefined();
  });
});
