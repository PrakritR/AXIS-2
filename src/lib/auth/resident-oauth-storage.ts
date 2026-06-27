const STORAGE_KEY = "axis:resident-signup-axis-id";

export function persistResidentSignupAxisId(axisId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, axisId.trim());
  } catch {
    /* ignore */
  }
}

export function readResidentSignupAxisId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw?.trim() || null;
  } catch {
    return null;
  }
}

export function clearResidentSignupAxisId(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
