/** Native app: role picker (Resident / Manager). */
export const NATIVE_AUTH_WELCOME_PATH = "/auth/welcome";
/** Web browser: generic portal sign-in. */
export const NATIVE_AUTH_WEB_ENTRY_PATH = "/auth/sign-in";
/** Native app: manager plan picker (replaces web /partner/pricing). */
export const NATIVE_MANAGER_PLAN_PATH = "/auth/manager/plan";

/** @deprecated Use NATIVE_AUTH_WEB_ENTRY_PATH */
export const NATIVE_AUTH_LEGACY_ENTRY_PATH = NATIVE_AUTH_WEB_ENTRY_PATH;

function readEntryOverride(): string | null {
  const fromEnv =
    process.env.NEXT_PUBLIC_NATIVE_AUTH_ENTRY?.trim() || process.env.CAP_NATIVE_ENTRY?.trim();
  if (!fromEnv) return null;
  return fromEnv.startsWith("/") ? fromEnv : `/${fromEnv}`;
}

/**
 * Capacitor `server.url` entry — always the native welcome screen at sync/build time.
 * Safe to import from capacitor.config.ts (no browser APIs).
 */
export function nativeShellEntryPath(): string {
  return readEntryOverride() ?? NATIVE_AUTH_WELCOME_PATH;
}
