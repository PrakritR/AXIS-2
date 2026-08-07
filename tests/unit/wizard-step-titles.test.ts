import { describe, expect, it } from "vitest";
import { createInitialRentalWizardState } from "@/lib/rental-application/state";
import { rentalWizardStepTitle } from "@/lib/rental-application/wizard-step-titles";

describe("rentalWizardStepTitle", () => {
  it("names step 1 household application", () => {
    const form = createInitialRentalWizardState();
    expect(rentalWizardStepTitle(1, form)).toBe("Household application");
  });

  it("names step 1 the same for a primary applicant", () => {
    const form = { ...createInitialRentalWizardState(), applicantRole: "signer" as const };
    expect(rentalWizardStepTitle(1, form)).toBe("Household application");
  });

  it("keeps later step titles unchanged", () => {
    const form = createInitialRentalWizardState();
    expect(rentalWizardStepTitle(3, form)).toBe("Property Information");
  });
});
