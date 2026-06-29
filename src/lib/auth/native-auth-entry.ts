export const NATIVE_AUTH_WELCOME_PATH = "/auth/welcome";
/** Generic web portal sign-in — not the native onboarding entry. */
export const NATIVE_AUTH_LEGACY_ENTRY_PATH = "/auth/sign-in";

export function isProductionAxisHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "www.axis-seattle-housing.com" || h === "axis-seattle-housing.com";
}

/**
 * Where the native shell should land when signed out (role picker → resident/manager).
 * Override with NEXT_PUBLIC_NATIVE_AUTH_ENTRY or CAP_NATIVE_ENTRY if needed.
 */
export function nativeAuthEntryPathForHost(_hostname: string): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_NATIVE_AUTH_ENTRY?.trim() || process.env.CAP_NATIVE_ENTRY?.trim();
  if (fromEnv) {
    return fromEnv.startsWith("/") ? fromEnv : `/${fromEnv}`;
  }
  return NATIVE_AUTH_WELCOME_PATH;
}

export function nativeAuthEntryPathFromServerBase(serverBase: string): string {
  try {
    return nativeAuthEntryPathForHost(new URL(serverBase).hostname);
  } catch {
    return NATIVE_AUTH_WELCOME_PATH;
  }
}

/** Client-side entry path (matches Capacitor server.url host). */
export function nativeAuthEntryPathClient(): string {
  if (typeof window === "undefined") return NATIVE_AUTH_WELCOME_PATH;
  const fromEnv = process.env.NEXT_PUBLIC_NATIVE_AUTH_ENTRY?.trim();
  if (fromEnv) {
    return fromEnv.startsWith("/") ? fromEnv : `/${fromEnv}`;
  }
  return NATIVE_AUTH_WELCOME_PATH;
}
