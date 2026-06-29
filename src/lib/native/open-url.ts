import { detectNativePlatformSync } from "@/lib/native/detect-native";

/** Open a URL in the WebView on web; native uses the system in-app browser when needed. */
export function isNativeAppShell(): boolean {
  return Boolean(detectNativePlatformSync());
}

/** Stripe Connect onboarding — popups fail in mobile WebViews; navigate in-place. */
export function shouldUseInAppConnectFlow(): boolean {
  return isNativeAppShell();
}

/** Supabase OAuth lands on /auth/callback or /auth/callback/... */
export function isAuthCallbackUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname === "/auth/callback" || parsed.pathname.startsWith("/auth/callback/");
  } catch {
    return /\/auth\/callback(\/|$|\?)/.test(url);
  }
}

/**
 * Google OAuth in the native shell — WKWebView is blocked (403 disallowed_useragent).
 * Opens SFSafariViewController / Chrome Custom Tab, then returns to the main WebView
 * when Supabase redirects to /auth/callback.
 */
export async function openOAuthUrl(url: string): Promise<void> {
  if (!url) return;
  if (!isNativeAppShell()) {
    window.location.assign(url);
    return;
  }

  const { Browser } = await import("@capacitor/browser");

  let settled = false;
  const cleanups: Array<() => void> = [];

  const complete = async (callbackUrl: string) => {
    if (settled) return;
    settled = true;
    cleanups.forEach((fn) => fn());
    await Browser.close().catch(() => {});
    window.location.href = callbackUrl;
  };

  const pageLoaded = await Browser.addListener("browserPageLoaded", (event) => {
    if (event.url && isAuthCallbackUrl(event.url)) {
      void complete(event.url);
    }
  });
  cleanups.push(() => void pageLoaded.remove());

  const finished = await Browser.addListener("browserFinished", () => {
    if (settled) return;
    settled = true;
    cleanups.forEach((fn) => fn());
  });
  cleanups.push(() => void finished.remove());

  await Browser.open({ url, presentationStyle: "fullscreen" });
}

/** External https links on native (Stripe Connect, etc.) — in-app browser, not WKWebView. */
export async function openAppUrl(url: string): Promise<void> {
  if (!url) return;
  if (!isNativeAppShell()) {
    window.location.assign(url);
    return;
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url, presentationStyle: "fullscreen" });
    return;
  }
  window.location.assign(url);
}
