import {
  buildNativeOAuthNavigationUrl,
  nativeOAuthSignInFailureUrl,
  resolveNativeOAuthCallbackTarget,
} from "@/lib/auth/complete-native-oauth";
import { nativeOAuthSetupHint } from "@/lib/auth/native-oauth-redirect-urls";
import { webPathFromNativeOAuthUrl } from "@/lib/auth/native-oauth-callback";
import { detectNativePlatformSync } from "@/lib/native/detect-native";

export const NATIVE_OAUTH_IN_PROGRESS_KEY = "axis_oauth_in_progress";

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

function markNativeOAuthInProgress(): void {
  try {
    sessionStorage.setItem(NATIVE_OAUTH_IN_PROGRESS_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearNativeOAuthInProgress(): void {
  try {
    sessionStorage.removeItem(NATIVE_OAUTH_IN_PROGRESS_KEY);
  } catch {
    /* ignore */
  }
}

export function isNativeOAuthInProgress(): boolean {
  try {
    return sessionStorage.getItem(NATIVE_OAUTH_IN_PROGRESS_KEY) === "1";
  } catch {
    return false;
  }
}

function navigateToNativeOAuthCallback(pathAndQuery: string): void {
  const destination = buildNativeOAuthNavigationUrl(pathAndQuery, window.location.origin);
  clearNativeOAuthInProgress();
  window.location.href = destination;
}

function navigateToNativeOAuthFailure(message: string): void {
  clearNativeOAuthInProgress();
  window.location.href = nativeOAuthSignInFailureUrl(message, window.location.origin);
}

async function tryLaunchUrlOAuthComplete(
  getLaunchUrl: () => Promise<{ url: string } | undefined>,
): Promise<boolean> {
  try {
    const launch = await getLaunchUrl();
    if (!launch?.url) return false;
    const pathAndQuery = resolveNativeOAuthCallbackTarget(launch.url, window.location.origin);
    if (!pathAndQuery) return false;
    navigateToNativeOAuthCallback(pathAndQuery);
    return true;
  } catch {
    return false;
  }
}

/**
 * Google OAuth in the native shell — WKWebView is blocked (403 disallowed_useragent).
 * Opens SFSafariViewController / Chrome Custom Tab, then returns to the main WebView
 * via custom URL scheme or universal link when Supabase redirects to /auth/callback.
 */
export async function openOAuthUrl(url: string): Promise<void> {
  if (!url) return;
  if (!isNativeAppShell()) {
    window.location.assign(url);
    return;
  }

  markNativeOAuthInProgress();
  const { Browser } = await import("@capacitor/browser");
  const { App } = await import("@capacitor/app");

  let settled = false;
  const cleanups: Array<() => void> = [];

  const completeFromRawUrl = (rawUrl: string): boolean => {
    const pathAndQuery = resolveNativeOAuthCallbackTarget(rawUrl, window.location.origin);
    if (!pathAndQuery) return false;
    if (settled) return true;
    settled = true;
    cleanups.forEach((fn) => fn());
    void Browser.close().catch(() => {});

    const parsed = new URL(pathAndQuery, window.location.origin);
    if (parsed.searchParams.get("error")) {
      const message =
        parsed.searchParams.get("error_description")?.replace(/\+/g, " ").trim() ||
        "Google sign-in could not be completed.";
      navigateToNativeOAuthFailure(message);
      return true;
    }

    navigateToNativeOAuthCallback(pathAndQuery);
    return true;
  };

  const appUrlListener = await App.addListener("appUrlOpen", (event) => {
    if (!event.url) return;
    completeFromRawUrl(event.url);
  });
  cleanups.push(() => void appUrlListener.remove());

  const resumeListener = await App.addListener("resume", () => {
    if (settled) return;
    void tryLaunchUrlOAuthComplete(() => App.getLaunchUrl()).then((handled) => {
      if (handled) {
        settled = true;
        cleanups.forEach((fn) => fn());
      }
    });
  });
  cleanups.push(() => void resumeListener.remove());

  const finished = await Browser.addListener("browserFinished", () => {
    if (settled) return;
    void (async () => {
      if (await tryLaunchUrlOAuthComplete(() => App.getLaunchUrl())) {
        settled = true;
        cleanups.forEach((fn) => fn());
        await Browser.close().catch(() => {});
        return;
      }

      try {
        const { createSupabaseBrowserClient } = await import("@/lib/supabase/browser");
        const supabase = createSupabaseBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session) {
          settled = true;
          cleanups.forEach((fn) => fn());
          await Browser.close().catch(() => {});
          clearNativeOAuthInProgress();
          window.location.href = "/auth/continue";
          return;
        }
      } catch {
        /* fall through */
      }

      if (settled) return;
      settled = true;
      cleanups.forEach((fn) => fn());
      navigateToNativeOAuthFailure(
        `Google sign-in did not return to the app. ${nativeOAuthSetupHint()}`,
      );
    })();
  });
  cleanups.push(() => void finished.remove());

  await Browser.open({ url, presentationStyle: "fullscreen" });
}

/** Handle OAuth/universal-link return when the app is already running. */
export async function handleNativeOAuthReturnUrl(rawUrl: string): Promise<boolean> {
  if (!isNativeAppShell() || !rawUrl) return false;
  const pathAndQuery = resolveNativeOAuthCallbackTarget(rawUrl, window.location.origin);
  if (!pathAndQuery) return false;

  const { Browser } = await import("@capacitor/browser");
  await Browser.close().catch(() => {});

  const parsed = new URL(pathAndQuery, window.location.origin);
  if (parsed.searchParams.get("error")) {
    const message =
      parsed.searchParams.get("error_description")?.replace(/\+/g, " ").trim() ||
      "Google sign-in could not be completed.";
    navigateToNativeOAuthFailure(message);
    return true;
  }

  navigateToNativeOAuthCallback(pathAndQuery);
  return true;
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
