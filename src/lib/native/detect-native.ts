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
