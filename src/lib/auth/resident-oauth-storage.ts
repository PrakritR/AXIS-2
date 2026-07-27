import { isUnsafeRedirectPath } from "@/lib/auth/normalize-post-auth-path";

const STORAGE_KEY = "axis:resident-signup-axis-id";
const NEXT_STORAGE_KEY = "axis:resident-signup-next";
const SETUP_TOKEN_KEY = "axis:resident-signup-setup-token";

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

export function persistResidentSignupSetupToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SETUP_TOKEN_KEY, token.trim());
  } catch {
    /* ignore */
  }
}

export function readResidentSignupSetupToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SETUP_TOKEN_KEY);
    return raw?.trim() || null;
  } catch {
    return null;
  }
}

export function clearResidentSignupSetupToken(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SETUP_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function persistResidentSignupNext(nextPath: string): void {
  if (typeof window === "undefined") return;
  const trimmed = nextPath.trim();
  // This value is read back and handed straight to `window.location.replace`
  // after OAuth completes, so it is validated at BOTH write and read time —
  // never trust that every future caller pre-sanitized it.
  if (isUnsafeRedirectPath(trimmed)) return;
  try {
    window.sessionStorage.setItem(NEXT_STORAGE_KEY, trimmed);
  } catch {
    /* ignore */
  }
}

export function readResidentSignupNext(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(NEXT_STORAGE_KEY)?.trim() ?? "";
    return raw && !isUnsafeRedirectPath(raw) ? raw : null;
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
