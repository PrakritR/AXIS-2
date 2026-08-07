import { RENTAL_WIZARD_STEP_COUNT } from "./types";

/** Persisted on each application once the 11-step household-first wizard shipped. */
export const RENTAL_WIZARD_STEP_SCHEMA = 2;

const LEGACY_RENTAL_WIZARD_STEP_COUNT = 12;

/** Map a persisted step from the old 12-step wizard onto the current 11-step flow. */
export function remapLegacyPersistedWizardStep(step: number): number {
  if (step <= 1) return 1;
  if (step === 2) return 1;
  if (step === 3) return 3;
  if (step === 4) return 2;
  if (step <= LEGACY_RENTAL_WIZARD_STEP_COUNT) return step - 1;
  return step;
}

export function normalizePersistedWizardStep(
  rawStep: unknown,
  schema: unknown,
): number | null {
  const parsed = typeof rawStep === "number" ? rawStep : Number.parseInt(String(rawStep ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  const floored = Math.floor(parsed);
  const step =
    schema === RENTAL_WIZARD_STEP_SCHEMA
      ? floored
      : remapLegacyPersistedWizardStep(floored);
  if (step < 1 || step > RENTAL_WIZARD_STEP_COUNT) return null;
  return step;
}
