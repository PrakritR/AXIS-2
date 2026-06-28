import { detectNativePlatformSync } from "@/lib/native/detect-native";

/** Open a URL in the WebView on native (OAuth, Stripe Connect) or the browser on web. */
export function openAppUrl(url: string): void {
  if (!url) return;
  window.location.assign(url);
}

export function isNativeAppShell(): boolean {
  return Boolean(detectNativePlatformSync());
}

/** Stripe Connect onboarding — popups fail in mobile WebViews; navigate in-place. */
export function shouldUseInAppConnectFlow(): boolean {
  return isNativeAppShell();
}
