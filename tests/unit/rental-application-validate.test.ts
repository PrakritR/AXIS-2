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

  it("rejects a future date of birth on its own terms, not as an age error", () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const iso = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}`;
    const state = { ...createInitialRentalWizardState(), dateOfBirth: iso };
    const errors = validateRentalWizardStep(4, state);
    expect(errors.dateOfBirth).toBe("Date of birth cannot be in the future.");
    expect(errors.dateOfBirth).not.toContain("18 years");
  });

  it("still rejects an under-18 date of birth with the age message", () => {
    const child = new Date();
    child.setFullYear(child.getFullYear() - 5);
    const iso = `${child.getFullYear()}-${String(child.getMonth() + 1).padStart(2, "0")}-${String(child.getDate()).padStart(2, "0")}`;
    const state = { ...createInitialRentalWizardState(), dateOfBirth: iso };
    const errors = validateRentalWizardStep(4, state);
    expect(errors.dateOfBirth).toContain("at least 18 years old");
  });

  it("accepts an adult date of birth", () => {
    const adult = new Date();
    adult.setFullYear(adult.getFullYear() - 30);
    const iso = `${adult.getFullYear()}-${String(adult.getMonth() + 1).padStart(2, "0")}-${String(adult.getDate()).padStart(2, "0")}`;
    const state = { ...createInitialRentalWizardState(), dateOfBirth: iso };
    const errors = validateRentalWizardStep(4, state);
    expect(errors.dateOfBirth).toBeUndefined();
  });

  it("rejects a short-term lease term on a listing that does not allow short-term stays", () => {
    const sub = { ...createDefaultListingSubmission(), shortTermRentalsAllowed: false };
    const state = {
      ...createInitialRentalWizardState(),
      propertyId: "prop-no-short",
      rentalType: "short_term" as const,
      leaseTerm: "Short-Term Stay",
    };
    const errors = validateRentalWizardStep(3, state, {
      property: { id: "prop-no-short", listingSubmission: sub },
    });
    expect(errors.leaseTerm).toContain("short-term");
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
