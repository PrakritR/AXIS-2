/** Manager-defined application questions — applicant answer helpers shared by the wizard, validation, review, and document builders. */

import {
  normalizeCustomApplicationFields,
  type ManagerCustomApplicationField,
} from "@/lib/manager-listing-submission";
import type { RentalCustomFieldAnswer } from "./types";

/** Error-map key for a custom question (RentalWizardErrors is a flat string map). */
export function customFieldErrorKey(fieldKey: string): string {
  return `custom:${fieldKey}`;
}

/** Custom questions configured on a listing submission; [] for listings without any. */
export function listingCustomApplicationFields(
  sub: { customApplicationFields?: unknown } | null | undefined,
): ManagerCustomApplicationField[] {
  return normalizeCustomApplicationFields(sub?.customApplicationFields);
}

export function customFieldAnswerValue(
  answers: RentalCustomFieldAnswer[] | undefined,
  fieldKey: string,
): string {
  return answers?.find((a) => a.key === fieldKey)?.value ?? "";
}

/**
 * Set one answer, snapshotting the question's label/type alongside the value.
 * Keeps answer order aligned with the question order the applicant saw.
 */
export function upsertCustomFieldAnswer(
  answers: RentalCustomFieldAnswer[],
  field: ManagerCustomApplicationField,
  value: string,
): RentalCustomFieldAnswer[] {
  const entry: RentalCustomFieldAnswer = {
    key: field.key,
    label: field.label,
    type: field.type,
    value,
  };
  const idx = answers.findIndex((a) => a.key === field.key);
  if (idx === -1) return [...answers, entry];
  return answers.map((a, i) => (i === idx ? entry : a));
}

/** Required/format errors for the listing's custom questions, keyed by customFieldErrorKey. */
export function validateCustomFieldAnswers(
  fields: ManagerCustomApplicationField[],
  answers: RentalCustomFieldAnswer[] | undefined,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const value = customFieldAnswerValue(answers, field.key).trim();
    if (field.type === "checkbox") {
      if (field.required && value !== "yes") {
        errors[customFieldErrorKey(field.key)] = "This box must be checked to continue.";
      }
      continue;
    }
    if (!value) {
      if (field.required) {
        errors[customFieldErrorKey(field.key)] = `${field.label} is required.`;
      }
      continue;
    }
    if (field.type === "number") {
      const n = Number(value.replace(/,/g, ""));
      if (!Number.isFinite(n)) {
        errors[customFieldErrorKey(field.key)] = "Enter a valid number.";
      }
    }
    if (field.type === "select" && field.options.length > 0 && !field.options.includes(value)) {
      errors[customFieldErrorKey(field.key)] = "Choose one of the listed options.";
    }
  }
  return errors;
}

/** Human-readable answer for review screens and the application document ("" when unanswered). */
export function formatCustomFieldAnswerDisplay(answer: RentalCustomFieldAnswer): string {
  const value = answer.value.trim();
  if (answer.type === "checkbox") return value === "yes" ? "Yes" : value === "no" || !value ? "No" : value;
  return value;
}

/** Stored answers worth showing (skips blank non-checkbox answers). */
export function displayableCustomFieldAnswers(
  answers: RentalCustomFieldAnswer[] | undefined,
): RentalCustomFieldAnswer[] {
  if (!Array.isArray(answers)) return [];
  return answers.filter(
    (a) => a && typeof a.key === "string" && typeof a.label === "string" && a.label.trim() && (a.type === "checkbox" || String(a.value ?? "").trim()),
  );
}
