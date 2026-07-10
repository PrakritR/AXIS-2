import type { NativePlatform } from "@/lib/native/push-client";

/** Synchronous Capacitor detection — avoids marketing UI flash before async hooks run. */
export function detectNativePlatformSync(): NativePlatform | null {
  if (typeof window === "undefined") return null;
  try {
    const cap = (
      window as Window & {
        Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
      }
    ).Capacitor;
    if (!cap?.isNativePlatform?.()) return null;
    const platform = cap.getPlatform?.();
    if (platform === "ios" || platform === "android") return platform;
    return "ios";
  } catch {
    return null;
  }
}

export function tagHtmlNativePlatform(platform: NativePlatform): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-native", platform);
}

/**
 * Synchronous "are we inside the native Capacitor shell?" check for IMPERATIVE
 * client code — e.g. toast strings and click handlers where the flash-free
 * `.native-hide` / `.native-only` CSS approach can't gate the content. Prefers the
 * `data-native` attribute (set in <head> before first paint) and falls back to the
 * live Capacitor bridge. Returns false during SSR.
 */
export function isNativeRuntimeSync(): boolean {
  if (typeof document !== "undefined" && document.documentElement.hasAttribute("data-native")) return true;
  return detectNativePlatformSync() !== null;
}
