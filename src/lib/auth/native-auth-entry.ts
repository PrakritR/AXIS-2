import { detectNativePlatformSync } from "@/lib/native/detect-native";
import {
  NATIVE_AUTH_LEGACY_ENTRY_PATH,
  NATIVE_AUTH_WEB_ENTRY_PATH,
  NATIVE_AUTH_WELCOME_PATH,
  NATIVE_MANAGER_PLAN_PATH,
  nativeShellEntryPath,
} from "@/lib/auth/native-shell-entry";

export {
  NATIVE_AUTH_LEGACY_ENTRY_PATH,
  NATIVE_AUTH_WEB_ENTRY_PATH,
  NATIVE_AUTH_WELCOME_PATH,
  NATIVE_MANAGER_PLAN_PATH,
  nativeShellEntryPath,
};

const WEB_TO_NATIVE_PATH: Record<string, string> = {
  "/partner/pricing": NATIVE_MANAGER_PLAN_PATH,
  "/pricing": NATIVE_MANAGER_PLAN_PATH,
};

/** @deprecated Use nativeShellEntryPath — kept for capacitor.config import stability. */
export function nativeAuthEntryPathFromServerBase(_serverBase?: string): string {
  return nativeShellEntryPath();
}

/**
 * In-browser: native shell → welcome; website → sign-in.
 */
export function nativeAuthEntryPathClient(): string {
  if (typeof window === "undefined") return NATIVE_AUTH_WELCOME_PATH;
  const override = process.env.NEXT_PUBLIC_NATIVE_AUTH_ENTRY?.trim();
  if (override) return override.startsWith("/") ? override : `/${override}`;
  if (detectNativePlatformSync()) return NATIVE_AUTH_WELCOME_PATH;
  return NATIVE_AUTH_WEB_ENTRY_PATH;
}

/** Map web marketing URLs to in-app equivalents when running in the native shell. */
export function nativeAwarePath(path: string): string {
  if (!detectNativePlatformSync()) return path;
  try {
    const url = new URL(path, "http://local");
    const mapped = WEB_TO_NATIVE_PATH[url.pathname];
    if (!mapped) return path;
    return `${mapped}${url.search}${url.hash}`;
  } catch {
    return WEB_TO_NATIVE_PATH[path] ?? path;
  }
}

/** @deprecated Use nativeShellEntryPath / nativeAuthEntryPathClient. */
export function nativeAuthEntryPathForHost(_hostname: string): string {
  return nativeShellEntryPath();
}

export function isProductionAxisHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "www.axis-seattle-housing.com" || h === "axis-seattle-housing.com";
}
