const STORAGE_KEY = "axis:resident-signup-axis-id";
const NEXT_STORAGE_KEY = "axis:resident-signup-next";

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

export function persistResidentSignupNext(nextPath: string): void {
  if (typeof window === "undefined") return;
  const trimmed = nextPath.trim();
  if (!trimmed.startsWith("/")) return;
  try {
    window.sessionStorage.setItem(NEXT_STORAGE_KEY, trimmed);
  } catch {
    /* ignore */
  }
}

export function readResidentSignupNext(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(NEXT_STORAGE_KEY);
    return raw?.trim().startsWith("/") ? raw.trim() : null;
  } catch {
    return null;
  }
}

export function clearResidentSignupNext(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(NEXT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
