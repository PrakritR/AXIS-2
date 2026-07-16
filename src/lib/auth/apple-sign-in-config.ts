import { resolveOAuthCallbackRedirectUrl } from "@/lib/auth/native-oauth-callback";
import { nativeSupabaseRedirectUrls, httpsOAuthCallbackUrls } from "@/lib/auth/native-oauth-redirect-urls";
import { detectNativePlatformSync } from "@/lib/native/detect-native";
import type { SupabaseClient } from "@supabase/supabase-js";

/** iOS bundle ID — must match capacitor.config.ts appId and Xcode PRODUCT_BUNDLE_IDENTIFIER. */
export const IOS_BUNDLE_ID = "com.axisseattlehousing.app";

/**
 * Apple Services ID for web OAuth — must exist in Apple Developer (Identifiers → Services IDs).
 * Not stored in the iOS project; create it manually. JWT `sub` and Supabase `external_apple_client_id`
 * must both use this value. See docs/apple-sign-in-setup.md.
 */
export const APPLE_WEB_SERVICES_ID = "com.axisseattlehousing.app.web";

/** Native iOS (`signInWithIdToken`) — bundle ID only, blank Supabase secret. */
export const APPLE_SIGN_IN_NATIVE_SETUP_MESSAGE =
  "Apple sign-in is not enabled in Supabase. Enable Authentication → Providers → Apple, set Client IDs to com.axisseattlehousing.app, and leave Secret Key blank for native iOS.";

/** @deprecated Prefer APPLE_SIGN_IN_NATIVE_SETUP_MESSAGE or APPLE_SIGN_IN_WEB_OAUTH_SETUP_MESSAGE. */
export const APPLE_SIGN_IN_SUPABASE_SETUP_MESSAGE = APPLE_SIGN_IN_NATIVE_SETUP_MESSAGE;

/** Web/laptop Supabase OAuth — Services ID + rotating secret; bundle ID alone is not enough. */
export const APPLE_SIGN_IN_WEB_OAUTH_SETUP_MESSAGE =
  `Apple sign-in on laptop/web needs web OAuth in Supabase: add your Apple Services ID (${APPLE_WEB_SERVICES_ID}) to Client IDs (comma-separated with ${IOS_BUNDLE_ID}), generate a Secret Key from your Apple .p8 signing key, and allowlist http://localhost:3000/auth/callback under Redirect URLs. See docs/apple-sign-in-setup.md.`;

export const APPLE_SIGN_IN_PROVIDER_DISABLED_MESSAGE =
  "Apple sign-in is not enabled in this Supabase project. Enable Authentication → Providers → Apple on the project that matches NEXT_PUBLIC_SUPABASE_URL. See docs/apple-sign-in-setup.md.";

export const APPLE_SIGN_IN_WEB_ENV_MESSAGE =
  "Apple sign-in is disabled on web (NEXT_PUBLIC_APPLE_SIGN_IN_ENABLED=false). See docs/apple-sign-in-setup.md.";

export const APPLE_SIGN_IN_REDIRECT_SETUP_MESSAGE =
  "Apple sign-in redirect URL is not allowlisted in Supabase. Add http://localhost:3000/auth/callback (and any /auth/callback/* paths you use) under Authentication → URL configuration → Redirect URLs. See docs/apple-sign-in-setup.md.";

/** Apple `invalid_client` on appleid.apple.com — Services ID missing or misconfigured in Apple Developer. */
export const APPLE_SIGN_IN_INVALID_CLIENT_MESSAGE =
  `Apple rejected web sign-in (invalid_client). Create the Services ID ${APPLE_WEB_SERVICES_ID} in Apple Developer (or update Supabase + scripts/configure-apple-web-oauth.mjs to match your existing Services ID), enable Sign in with Apple on it, and register your Supabase callback domain/return URL. See docs/apple-sign-in-setup.md#invalid_client-invalid-client.`;

/** Supabase OAuth `redirectTo` for web Apple sign-in (must match signInWithOAuth). */
export function appleWebOAuthRedirectUrl(origin: string, fixedCallbackPath?: string): string {
  return resolveOAuthCallbackRedirectUrl(origin, fixedCallbackPath);
}

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
const webAppleOAuthCache = new Map<string, AppleOAuthProbeResult>();
const webAppleOAuthPromises = new Map<string, Promise<AppleOAuthProbeResult>>();

/** Test-only reset for module-level Apple web OAuth probe + toast dedup state. */
export function resetAppleSignInSessionStateForTests(): void {
  appleSignInErrorsShown.clear();
  webAppleOAuthCache.clear();
  webAppleOAuthPromises.clear();
}

/** Show each Apple auth error toast at most once per browser tab session. */
export function shouldShowAppleSignInErrorToast(message: string): boolean {
  if (appleSignInErrorsShown.has(message)) return false;
  appleSignInErrorsShown.add(message);
  return true;
}

type AppleOAuthErrorSurface = "web" | "native";

function resolveAppleOAuthErrorMessage(message: string, surface: AppleOAuthErrorSurface): string | null {
  const lower = message.toLowerCase();

  if (
    lower.includes("missing oauth secret") ||
    lower.includes("missing client secret") ||
    (lower.includes("oauth secret") && lower.includes("missing"))
  ) {
    return APPLE_SIGN_IN_WEB_OAUTH_SETUP_MESSAGE;
  }

  if (lower.includes("invalid_client") || (lower.includes("invalid") && lower.includes("client"))) {
    return APPLE_SIGN_IN_INVALID_CLIENT_MESSAGE;
  }

  if (
    lower.includes("redirect") &&
    (lower.includes("invalid") || lower.includes("not allowed") || lower.includes("mismatch"))
  ) {
    return APPLE_SIGN_IN_REDIRECT_SETUP_MESSAGE;
  }

  if (
    lower.includes("not enabled") ||
    lower.includes("provider is not enabled") ||
    (lower.includes("provider") && lower.includes("disabled"))
  ) {
    return surface === "native"
      ? APPLE_SIGN_IN_NATIVE_SETUP_MESSAGE
      : APPLE_SIGN_IN_PROVIDER_DISABLED_MESSAGE;
  }

  if (lower.includes("unsupported provider")) {
    return surface === "web" ? APPLE_SIGN_IN_WEB_OAUTH_SETUP_MESSAGE : APPLE_SIGN_IN_NATIVE_SETUP_MESSAGE;
  }

  return null;
}

function parseAppleOAuthProbeFailure(body: { error_code?: string; msg?: string }): string | null {
  return resolveAppleOAuthErrorMessage(body.msg ?? "", "web");
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
  return resolveAppleOAuthErrorMessage(message, "web") ?? message;
}

/** Map native `signInWithIdToken` failures to actionable setup copy. */
export function mapNativeAppleOAuthErrorMessage(message: string): string {
  return resolveAppleOAuthErrorMessage(message, "native") ?? message;
}

/**
 * One cached web Apple OAuth start per tab: signInWithOAuth + authorize probe.
 * Native iOS bypasses this (signInWithIdToken).
 */
export async function resolveAppleWebOAuthSignIn(
  supabase: SupabaseClient,
  redirectTo: string,
): Promise<AppleOAuthProbeResult> {
  const cached = webAppleOAuthCache.get(redirectTo);
  if (cached) return cached;

  const inFlight = webAppleOAuthPromises.get(redirectTo);
  if (inFlight) return inFlight;

  const promise: Promise<AppleOAuthProbeResult> = (async (): Promise<AppleOAuthProbeResult> => {
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

  webAppleOAuthPromises.set(redirectTo, promise);

  try {
    const result = await promise;
    webAppleOAuthCache.set(redirectTo, result);
    return result;
  } finally {
    webAppleOAuthPromises.delete(redirectTo);
  }
}
