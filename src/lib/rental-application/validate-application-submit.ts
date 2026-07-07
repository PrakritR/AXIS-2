import type { MockProperty } from "@/data/types";
import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import { normalizeCustomApplicationFields } from "@/lib/manager-listing-submission";
import {
  isWizardFormFieldEnabled,
  listingDisabledWizardFormKeys,
  resolveListingApplicationFields,
} from "@/lib/rental-application/application-field-catalog";
import { IN_PROGRESS_APPLICATION_STAGE } from "@/lib/rental-application/in-progress-application";
import { createInitialRentalWizardState } from "@/lib/rental-application/state";
import type { RentalWizardFormState } from "@/lib/rental-application/types";
import { countValidationErrors, validateRentalWizardStep } from "@/lib/rental-application/validate";

const SUBMIT_VALIDATION_STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12] as const;

function mergeApplicationForm(application: Partial<RentalWizardFormState>): RentalWizardFormState {
  return { ...createInitialRentalWizardState(), ...application };
}

function listingSubmissionFromProperty(
  property: Pick<MockProperty, "listingSubmission"> | null | undefined,
): ManagerListingSubmissionV1 | undefined {
  return property?.listingSubmission?.v === 1 ? property.listingSubmission : undefined;
}

function hasFilledWizardValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

export function isInProgressApplicationStage(stage: string | undefined | null): boolean {
  return stage?.trim().toLowerCase() === IN_PROGRESS_APPLICATION_STAGE.toLowerCase();
}

export function findDisabledApplicationFieldViolation(
  application: Partial<RentalWizardFormState>,
  sub: ManagerListingSubmissionV1 | null | undefined,
): string | null {
  const disabled = listingDisabledWizardFormKeys(sub);
  for (const key of disabled) {
    const value = application[key as keyof RentalWizardFormState];
    if (hasFilledWizardValue(value)) {
      return "This listing does not accept one or more submitted application fields.";
    }
  }
  return null;
}

export function sanitizeApplicationFormForListing(
  form: RentalWizardFormState,
  sub: ManagerListingSubmissionV1 | null | undefined,
): RentalWizardFormState {
  const disabled = listingDisabledWizardFormKeys(sub);
  if (disabled.size === 0) return form;
  const next: RentalWizardFormState = { ...form };
  for (const key of disabled) {
    if (!(key in next)) continue;
    const current = next[key as keyof RentalWizardFormState];
    if (typeof current === "boolean") {
      (next as Record<string, unknown>)[key] = false;
      continue;
    }
    if (current === "yes" || current === "no") {
      (next as Record<string, unknown>)[key] = null;
      continue;
    }
    if (typeof current === "string") {
      (next as Record<string, unknown>)[key] = "";
    }
  }
  return next;
}

export function residentApplicationScreeningAllowed(
  sub: ManagerListingSubmissionV1 | null | undefined,
  form: RentalWizardFormState | null | undefined,
): boolean {
  return isWizardFormFieldEnabled(sub, "consentCredit") && form?.consentCredit === true;
}

export type ValidateResidentApplicationSubmitResult =
  | { ok: true }
  | { ok: false; error: string; step?: number };

export function validateResidentApplicationSubmit(input: {
  application: Partial<RentalWizardFormState>;
  property?: Pick<MockProperty, "id" | "listingSubmission"> | null;
  inProgress: boolean;
}): ValidateResidentApplicationSubmitResult {
  const sub = listingSubmissionFromProperty(input.property);
  const disabledViolation = findDisabledApplicationFieldViolation(input.application, sub);
  if (disabledViolation) return { ok: false, error: disabledViolation };

  if (input.inProgress) return { ok: true };

  void resolveListingApplicationFields(sub, normalizeCustomApplicationFields);
  const form = mergeApplicationForm(input.application);
  for (const step of SUBMIT_VALIDATION_STEPS) {
    const errors = validateRentalWizardStep(step, form, { property: input.property ?? undefined });
    if (countValidationErrors(errors) > 0) {
      const message =
        errors._general ??
        Object.values(errors).find((value): value is string => typeof value === "string" && value.length > 0) ??
        "Application validation failed.";
      return { ok: false, error: message, step };
    }
  }
  return { ok: true };
}
