/** Staged compose draft when navigating from another portal section (e.g. new vendor onboarding). */

export type ManagerComposePrefill = {
  subject: string;
  body: string;
  recipientEmail?: string;
};

const STORAGE_KEY = "manager-compose-prefill-v1";

export function stageManagerComposePrefill(prefill: ManagerComposePrefill): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(prefill));
  } catch {
    /* quota / private mode */
  }
}

export function consumeManagerComposePrefill(): ManagerComposePrefill | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(STORAGE_KEY);
    const parsed = JSON.parse(raw) as ManagerComposePrefill;
    if (!parsed?.subject?.trim() || !parsed?.body?.trim()) return null;
    return parsed;
  } catch {
    return null;
  }
}
