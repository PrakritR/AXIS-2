import { describe, expect, it } from "vitest";
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
});
