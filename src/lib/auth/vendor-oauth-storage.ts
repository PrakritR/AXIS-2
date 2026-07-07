const TOKEN_STORAGE_KEY = "axis:vendor-signup-invite-token";
const NEXT_STORAGE_KEY = "axis:vendor-signup-next";

export function persistVendorSignupInviteToken(token: string): void {
  if (typeof window === "undefined") return;
  const trimmed = token.trim();
  if (!trimmed) return;
  try {
    window.sessionStorage.setItem(TOKEN_STORAGE_KEY, trimmed);
  } catch {
    /* ignore */
  }
}

export function readVendorSignupInviteToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
    return raw?.trim() || null;
  } catch {
    return null;
  }
}

export function clearVendorSignupInviteToken(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function persistVendorSignupNext(nextPath: string): void {
  if (typeof window === "undefined") return;
  const trimmed = nextPath.trim();
  if (!trimmed.startsWith("/")) return;
  try {
    window.sessionStorage.setItem(NEXT_STORAGE_KEY, trimmed);
  } catch {
    /* ignore */
  }
}

export function readVendorSignupNext(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(NEXT_STORAGE_KEY);
    return raw?.trim().startsWith("/") ? raw.trim() : null;
  } catch {
    return null;
  }
}

export function clearVendorSignupNext(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(NEXT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
