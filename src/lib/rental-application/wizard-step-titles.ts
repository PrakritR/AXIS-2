import type { RentalWizardFormState } from "./types";

export const RENTAL_WIZARD_STEP_TITLES = [
  "Getting started",
  "Co-Signer",
  "Property Information",
  "Signer Information",
  "Current Address",
  "Previous Address",
  "Employment and Income",
  "References",
  "Additional Details",
  "Consent and Signature",
  "Review",
  "Application fee",
] as const;

/** Step header copy — step 1 reflects whether the applicant has picked a role yet. */
export function rentalWizardStepTitle(step: number, form: RentalWizardFormState): string {
  const fallback = RENTAL_WIZARD_STEP_TITLES[step - 1] ?? "";
  if (step !== 1) return fallback;
  if (form.applicantRole === null) return "Primary applicant or co-signer";
  if (form.applicantRole === "signer") return "Household application";
  return fallback;
}
