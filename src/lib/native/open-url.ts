import {
  clearOAuthNextPathStorage,
  readOAuthNextPathFromStorage,
} from "@/lib/auth/oauth-next-cookie";
import { webPathFromNativeOAuthUrl } from "@/lib/auth/native-oauth-callback";
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
  if (webPathFromNativeOAuthUrl(url, "https://local") !== null) return true;
  try {
    const parsed = new URL(url);
    return parsed.pathname === "/auth/callback" || parsed.pathname.startsWith("/auth/callback/");
  } catch {
    return /\/auth\/callback(\/|$|\?)/.test(url);
  }
}

function resolveCallbackTarget(url: string): string | null {
  const fromScheme = webPathFromNativeOAuthUrl(url, window.location.origin);
  if (fromScheme) return fromScheme;
  try {
    const opened = new URL(url, window.location.origin);
    if (!isAuthCallbackUrl(url) && opened.pathname !== "/auth/callback" && !opened.pathname.startsWith("/auth/callback/")) {
      return null;
    }
    return `${opened.pathname}${opened.search}${opened.hash}`;
  } catch {
    return null;
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

    let target = callbackUrl;
    try {
      const storedNext = readOAuthNextPathFromStorage();
      if (storedNext) {
        const parsed = new URL(callbackUrl, window.location.origin);
        if (!parsed.searchParams.get("next")) {
          parsed.searchParams.set("next", storedNext);
          target = parsed.toString();
        }
      }
    } catch {
      /* use callbackUrl as-is */
    }
    clearOAuthNextPathStorage();
    window.location.href = target;
  };

  const { App } = await import("@capacitor/app");
  const appUrlListener = await App.addListener("appUrlOpen", (event) => {
    if (!event.url) return;
    const target = resolveCallbackTarget(event.url);
    if (!target) return;
    void complete(target.startsWith("http") ? target : `${window.location.origin}${target}`);
  });
  cleanups.push(() => void appUrlListener.remove());

  const finished = await Browser.addListener("browserFinished", () => {
    if (settled) return;
    cleanups.forEach((fn) => fn());
    void (async () => {
      try {
        const { createSupabaseBrowserClient } = await import("@/lib/supabase/browser");
        const supabase = createSupabaseBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session) {
          settled = true;
          await Browser.close().catch(() => {});
          clearOAuthNextPathStorage();
          window.location.href = "/auth/continue";
        }
      } catch {
        settled = true;
      }
    })();
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
