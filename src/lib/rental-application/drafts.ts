import type { RentalWizardFormState } from "./types";

const RENTAL_WIZARD_DRAFT_KEY = "axis:rental-application:draft:v1";
const COSIGNER_DRAFT_KEY = "axis:rental-cosigner:draft:v1";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readJson<T>(key: string): T | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage write failures so the form remains usable.
  }
}

function removeItem(key: string) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage removal failures.
  }
}

export function loadRentalWizardDraft(): Partial<RentalWizardFormState> | null {
  return readJson<Partial<RentalWizardFormState>>(RENTAL_WIZARD_DRAFT_KEY);
}

export function saveRentalWizardDraft(value: RentalWizardFormState) {
  writeJson(RENTAL_WIZARD_DRAFT_KEY, value);
}

export function clearRentalWizardDraft() {
  removeItem(RENTAL_WIZARD_DRAFT_KEY);
}

export function loadCosignerDraft<T>(): T | null {
  return readJson<T>(COSIGNER_DRAFT_KEY);
}

export function saveCosignerDraft<T>(value: T) {
  writeJson(COSIGNER_DRAFT_KEY, value);
}

export function clearCosignerDraft() {
  removeItem(COSIGNER_DRAFT_KEY);
}
