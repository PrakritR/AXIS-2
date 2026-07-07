import { nativeSupabaseRedirectUrls, httpsOAuthCallbackUrls } from "@/lib/auth/native-oauth-redirect-urls";
import { detectNativePlatformSync } from "@/lib/native/detect-native";
import type { SupabaseClient } from "@supabase/supabase-js";

/** iOS bundle ID — must match capacitor.config.ts appId and Xcode PRODUCT_BUNDLE_IDENTIFIER. */
export const IOS_BUNDLE_ID = "com.axisseattlehousing.app";

export const APPLE_SIGN_IN_SUPABASE_SETUP_MESSAGE =
  "Apple sign-in is not enabled in Supabase. Enable Authentication → Providers → Apple, set Client IDs to com.axisseattlehousing.app, and leave Secret Key blank for native iOS.";

export const APPLE_SIGN_IN_WEB_ENV_MESSAGE =
  "Apple sign-in is disabled on web (NEXT_PUBLIC_APPLE_SIGN_IN_ENABLED=false). See docs/apple-sign-in-setup.md.";

export const APPLE_SIGN_IN_REDIRECT_SETUP_MESSAGE =
  "Apple sign-in redirect URL is not allowlisted in Supabase. Add your /auth/callback URLs under Authentication → URL configuration → Redirect URLs (see docs/apple-sign-in-setup.md).";

export function supabaseAppleOAuthRedirectUri(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "");
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  return `${url}/auth/v1/callback`;
}

/** Legacy opt-in flag — still honored when explicitly true. */
export function isAppleSignInEnabledInEnv(): boolean {
  return process.env.NEXT_PUBLIC_APPLE_SIGN_IN_ENABLED === "true";
}

/** Explicit opt-out for web OAuth — native iOS always shows Apple when Google is offered (App Store 4.8). */
export function isAppleSignInDisabledOnWeb(): boolean {
  return process.env.NEXT_PUBLIC_APPLE_SIGN_IN_ENABLED === "false";
}

/** Whether the Apple button should render in the current shell. */
export function isAppleSignInAvailable(): boolean {
  if (detectNativePlatformSync() === "ios") return true;
  if (isAppleSignInDisabledOnWeb()) return false;
  return true;
}

/** Dev-only console hint when Apple is explicitly hidden on web. */
export function logAppleSignInUnavailableDevHint(): void {
  if (process.env.NODE_ENV === "production") return;
  if (typeof window === "undefined") return;
  if (isAppleSignInAvailable()) return;
  console.info(`[Apple Sign In] ${APPLE_SIGN_IN_WEB_ENV_MESSAGE}`);
}

/** Redirect URLs to allowlist in Supabase → Authentication → URL configuration. */
export function appleSignInRedirectUrls(origin?: string): string[] {
  return [...httpsOAuthCallbackUrls(origin), ...nativeSupabaseRedirectUrls()];
}

export type AppleOAuthProbeResult = { ok: true; url?: string } | { ok: false; message: string };

const appleSignInErrorsShown = new Set<string>();
let webAppleOAuthCache: AppleOAuthProbeResult | null = null;
let webAppleOAuthPromise: Promise<AppleOAuthProbeResult> | null = null;

/** Test-only reset for module-level Apple web OAuth probe + toast dedup state. */
export function resetAppleSignInSessionStateForTests(): void {
  appleSignInErrorsShown.clear();
  webAppleOAuthCache = null;
  webAppleOAuthPromise = null;
}

/** Show each Apple auth error toast at most once per browser tab session. */
export function shouldShowAppleSignInErrorToast(message: string): boolean {
  if (appleSignInErrorsShown.has(message)) return false;
  appleSignInErrorsShown.add(message);
  return true;
}

function parseAppleOAuthProbeFailure(body: { error_code?: string; msg?: string }): string | null {
  const msg = (body.msg ?? "").toLowerCase();
  if (
    msg.includes("not enabled") ||
    msg.includes("unsupported provider") ||
    (msg.includes("provider") && msg.includes("disabled"))
  ) {
    return APPLE_SIGN_IN_SUPABASE_SETUP_MESSAGE;
  }
  if (
    msg.includes("redirect") &&
    (msg.includes("invalid") || msg.includes("not allowed") || msg.includes("mismatch"))
  ) {
    return APPLE_SIGN_IN_REDIRECT_SETUP_MESSAGE;
  }
  return null;
}

function isOAuthAuthorizeRedirect(response: Response): boolean {
  if (response.type === "opaqueredirect") return true;
  return response.status >= 300 && response.status < 400;
}

/**
 * Supabase returns JSON (not a redirect) when Apple OAuth is disabled. Probe before
 * sending users to the authorize URL so they see a toast instead of a raw error page.
 */
export async function probeSupabaseAppleOAuthUrl(oauthUrl: string): Promise<AppleOAuthProbeResult> {
  try {
    const response = await fetch(oauthUrl, {
      method: "GET",
      redirect: "manual",
      credentials: "omit",
    });
    if (isOAuthAuthorizeRedirect(response)) {
      return { ok: true };
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return { ok: true };
    }
    const body = (await response.json()) as { error_code?: string; msg?: string };
    const failureMessage = parseAppleOAuthProbeFailure(body);
    if (failureMessage) {
      return { ok: false, message: failureMessage };
    }
    return { ok: true };
  } catch {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[Apple Sign In] Could not probe Supabase OAuth URL; proceeding. If you see a JSON error page, enable Apple in Supabase.",
      );
    }
    return { ok: true };
  }
}

function mapAppleOAuthClientError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("not enabled") || lower.includes("unsupported provider")) {
    return APPLE_SIGN_IN_SUPABASE_SETUP_MESSAGE;
  }
  return message;
}

/**
 * One cached web Apple OAuth start per tab: signInWithOAuth + authorize probe.
 * Native iOS bypasses this (signInWithIdToken).
 */
export async function resolveAppleWebOAuthSignIn(
  supabase: SupabaseClient,
  redirectTo: string,
): Promise<AppleOAuthProbeResult> {
  if (webAppleOAuthCache) return webAppleOAuthCache;
  if (webAppleOAuthPromise) return webAppleOAuthPromise;

  webAppleOAuthPromise = (async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });

    if (error) {
      return { ok: false, message: mapAppleOAuthClientError(error.message) };
    }
    if (!data?.url) {
      return { ok: false, message: "Could not start Apple sign-in." };
    }

    const probe = await probeSupabaseAppleOAuthUrl(data.url);
    if (!probe.ok) return probe;
    return { ok: true, url: data.url };
  })();

  try {
    const result = await webAppleOAuthPromise;
    webAppleOAuthCache = result;
    return result;
  } finally {
    webAppleOAuthPromise = null;
  }
}
