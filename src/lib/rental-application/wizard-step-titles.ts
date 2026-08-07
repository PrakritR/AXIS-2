import type { RentalWizardFormState } from "./types";

export const RENTAL_WIZARD_STEP_TITLES = [
  "Household application",
  "Signer Information",
  "Property Information",
  "Current Address",
  "Previous Address",
  "Employment and Income",
  "References",
  "Additional Details",
  "Consent and Signature",
  "Review",
  "Application fee",
] as const;

/** Step header copy for the household-first application flow. */
export function rentalWizardStepTitle(step: number, _form: RentalWizardFormState): string {
  return RENTAL_WIZARD_STEP_TITLES[step - 1] ?? "";
}
