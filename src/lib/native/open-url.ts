import {
  buildNativeOAuthNavigationUrl,
  nativeOAuthSignInFailureUrl,
  resolveNativeOAuthCallbackTarget,
} from "@/lib/auth/complete-native-oauth";
import {
  appendOAuthContextToCallbackPath,
  completeNativeOAuthInWebView,
} from "@/lib/auth/complete-native-oauth-client";
import { nativeOAuthSetupHint } from "@/lib/auth/native-oauth-redirect-urls";
import { webPathFromNativeOAuthUrl, isNativeOAuthShell } from "@/lib/auth/native-oauth-callback";

export const NATIVE_OAUTH_IN_PROGRESS_KEY = "axis_oauth_in_progress";
const NATIVE_OAUTH_CALLBACK_CODE_KEY = "axis_oauth_callback_code";

const PORTAL_PATH_PREFIXES = ["/portal", "/resident", "/admin", "/auth/choose-portal"] as const;

function isPortalDestinationPath(pathname: string): boolean {
  return PORTAL_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Non-reversible fingerprint of the OAuth callback code — only used to detect a
 * duplicate callback delivery, never to recover the code, so we avoid persisting
 * the single-use authorization code itself in cleartext sessionStorage.
 */
function fingerprintOAuthCode(code: string): string {
  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    hash = (Math.imul(hash, 31) + code.charCodeAt(i)) | 0;
  }
  return `${code.length}.${(hash >>> 0).toString(36)}`;
}

async function redirectSignedInUserToContinue(): Promise<boolean> {
  try {
    const { createSupabaseBrowserClient } = await import("@/lib/supabase/browser");
    const { waitForOAuthUser } = await import("@/lib/auth/wait-for-oauth-user");
    const supabase = createSupabaseBrowserClient();
    const user = await waitForOAuthUser(supabase, { attempts: 5, delayMs: 120 });
    if (!user) return false;
    window.location.replace("/auth/continue");
    return true;
  } catch {
    return false;
  }
}

/** Open a URL in the WebView on web; native uses the system in-app browser when needed. */
export function isNativeAppShell(): boolean {
  return isNativeOAuthShell();
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
    sessionStorage.removeItem(NATIVE_OAUTH_CALLBACK_CODE_KEY);
  } catch {
    /* ignore */
  }
}

export function clearNativeOAuthInProgress(): void {
  try {
    sessionStorage.removeItem(NATIVE_OAUTH_IN_PROGRESS_KEY);
    sessionStorage.removeItem(NATIVE_OAUTH_CALLBACK_CODE_KEY);
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
  try {
    const parsed = new URL(pathAndQuery, window.location.origin);
    const code = parsed.searchParams.get("code");
    if (code) {
      const fingerprint = fingerprintOAuthCode(code);
      const seen = sessionStorage.getItem(NATIVE_OAUTH_CALLBACK_CODE_KEY);
      if (seen === fingerprint) {
        const path = window.location.pathname;
        if (isPortalDestinationPath(path) || path.startsWith("/auth/continue")) return;
        void redirectSignedInUserToContinue();
        return;
      }
      sessionStorage.setItem(NATIVE_OAUTH_CALLBACK_CODE_KEY, fingerprint);
    }
  } catch {
    /* ignore */
  }

  void (async () => {
    const result = await completeNativeOAuthInWebView(pathAndQuery);
    clearNativeOAuthInProgress();
    if (result.ok) {
      window.location.replace(result.redirectTo);
      return;
    }

    if (result.fallbackPath) {
      const destination = buildNativeOAuthNavigationUrl(
        appendOAuthContextToCallbackPath(result.fallbackPath, window.location.origin),
        window.location.origin,
      );
      window.location.href = destination;
      return;
    }

    navigateToNativeOAuthFailure(result.error);
  })();
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

      // appUrlOpen / client exchange may still be running — wait before failing.
      for (let attempt = 0; attempt < 30; attempt++) {
        if (settled) return;
        await new Promise((resolve) => window.setTimeout(resolve, 300));
        const path = window.location.pathname;
        if (isPortalDestinationPath(path)) {
          settled = true;
          cleanups.forEach((fn) => fn());
          clearNativeOAuthInProgress();
          return;
        }
        if (path.startsWith("/auth/callback") || path.startsWith("/auth/continue")) {
          continue;
        }
        try {
          const { createSupabaseBrowserClient } = await import("@/lib/supabase/browser");
          const { waitForOAuthUser } = await import("@/lib/auth/wait-for-oauth-user");
          const supabase = createSupabaseBrowserClient();
          const user = await waitForOAuthUser(supabase, { attempts: 1, delayMs: 0 });
          if (user) {
            const oauthCode = sessionStorage.getItem(NATIVE_OAUTH_CALLBACK_CODE_KEY);
            if (oauthCode) {
              // appUrlOpen started the callback exchange — wait for it to route.
              continue;
            }
            settled = true;
            cleanups.forEach((fn) => fn());
            clearNativeOAuthInProgress();
            window.location.replace("/auth/continue");
            return;
          }
        } catch {
          /* retry */
        }
      }

      if (settled) return;
      const path = window.location.pathname;
      if (path.startsWith("/auth/callback") || path.startsWith("/auth/continue")) {
        clearNativeOAuthInProgress();
        return;
      }

      if (await redirectSignedInUserToContinue()) {
        settled = true;
        cleanups.forEach((fn) => fn());
        clearNativeOAuthInProgress();
        return;
      }

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
