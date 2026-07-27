import type { RentalWizardFormState } from "./types";

const RENTAL_WIZARD_DRAFT_KEY = "axis:rental-application:draft:v1";
export const DRAFT_AXIS_ID_KEY = "axis:rental-application:draft-axis-id:v1";
const COSIGNER_DRAFT_KEY = "axis:rental-cosigner:draft:v1";
const memoryDrafts = new Map<string, unknown>();

function canUseStorage() {
  return typeof window !== "undefined";
}

function readJson<T>(key: string): T | null {
  if (!canUseStorage()) return null;
  return memoryDrafts.has(key) ? (memoryDrafts.get(key) as T) : null;
}

function writeJson(key: string, value: unknown) {
  if (!canUseStorage()) return;
  memoryDrafts.set(key, value);
}

function removeItem(key: string) {
  if (!canUseStorage()) return;
  memoryDrafts.delete(key);
}

export function loadRentalWizardDraft(): Partial<RentalWizardFormState> | null {
  return readJson<Partial<RentalWizardFormState>>(RENTAL_WIZARD_DRAFT_KEY);
}

export function saveRentalWizardDraft(value: RentalWizardFormState) {
  writeJson(RENTAL_WIZARD_DRAFT_KEY, value);
}

export function loadRentalWizardDraftAxisId(): string | null {
  return readJson<string>(DRAFT_AXIS_ID_KEY);
}

export function saveRentalWizardDraftAxisId(id: string) {
  writeJson(DRAFT_AXIS_ID_KEY, id.trim());
}

export function clearRentalWizardDraft() {
  removeItem(RENTAL_WIZARD_DRAFT_KEY);
  removeItem(DRAFT_AXIS_ID_KEY);
  clearPublicApplyResumeAxisId();
}

/**
 * The PUBLIC apply flow's reload-survivable resume reference. The in-memory
 * draft above is wiped by a real page reload (and by a return from an external
 * redirect like Stripe checkout), so the axis id — and ONLY the axis id, never
 * answers/PII/photo bytes — is kept in sessionStorage. Together with the
 * freshest resident-setup token (already in sessionStorage, see
 * `rememberApplicationSetupToken`) it lets a guest resume their in-progress
 * application after a reload; it never outlives the tab.
 */
const PUBLIC_APPLY_RESUME_AXIS_ID_KEY = "axis:rental-application:public-resume-axis-id:v1";

export function rememberPublicApplyResumeAxisId(id: string) {
  const trimmed = id.trim();
  if (!canUseStorage() || !trimmed) return;
  try {
    window.sessionStorage.setItem(PUBLIC_APPLY_RESUME_AXIS_ID_KEY, trimmed);
  } catch {
    /* ignore */
  }
}

export function loadPublicApplyResumeAxisId(): string | null {
  if (!canUseStorage()) return null;
  try {
    return window.sessionStorage.getItem(PUBLIC_APPLY_RESUME_AXIS_ID_KEY);
  } catch {
    return null;
  }
}

export function clearPublicApplyResumeAxisId() {
  if (!canUseStorage()) return;
  try {
    window.sessionStorage.removeItem(PUBLIC_APPLY_RESUME_AXIS_ID_KEY);
  } catch {
    /* ignore */
  }
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
