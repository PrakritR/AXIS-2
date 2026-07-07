import { nativeSupabaseRedirectUrls, httpsOAuthCallbackUrls } from "@/lib/auth/native-oauth-redirect-urls";
import { detectNativePlatformSync } from "@/lib/native/detect-native";

/** iOS bundle ID — must match capacitor.config.ts appId and Xcode PRODUCT_BUNDLE_IDENTIFIER. */
export const IOS_BUNDLE_ID = "com.axisseattlehousing.app";

export const APPLE_SIGN_IN_SUPABASE_SETUP_MESSAGE =
  "Apple sign-in is not enabled in Supabase. Enable Authentication → Providers → Apple, set Client IDs to com.axisseattlehousing.app, and leave Secret Key blank for native iOS.";

export const APPLE_SIGN_IN_WEB_ENV_MESSAGE =
  "Apple sign-in is hidden on web until NEXT_PUBLIC_APPLE_SIGN_IN_ENABLED=true (after Apple is enabled in Supabase). See docs/apple-sign-in-setup.md.";

export function supabaseAppleOAuthRedirectUri(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "");
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  return `${url}/auth/v1/callback`;
}

/** Explicit opt-in for web OAuth — native iOS always shows Apple when Google is offered (App Store 4.8). */
export function isAppleSignInEnabledInEnv(): boolean {
  return process.env.NEXT_PUBLIC_APPLE_SIGN_IN_ENABLED === "true";
}

/** Whether the Apple button should render in the current shell. */
export function isAppleSignInAvailable(): boolean {
  if (detectNativePlatformSync() === "ios") return true;
  return isAppleSignInEnabledInEnv();
}

/** Dev-only console hint when Apple is hidden on web. */
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

type AppleOAuthProbeResult = { ok: true } | { ok: false; message: string };

function isSupabaseAppleProviderDisabledPayload(body: { error_code?: string; msg?: string }): boolean {
  const msg = (body.msg ?? "").toLowerCase();
  return (
    body.error_code === "validation_failed" ||
    msg.includes("not enabled") ||
    msg.includes("unsupported provider")
  );
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
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return { ok: true };
    }
    const body = (await response.json()) as { error_code?: string; msg?: string };
    if (isSupabaseAppleProviderDisabledPayload(body)) {
      return { ok: false, message: APPLE_SIGN_IN_SUPABASE_SETUP_MESSAGE };
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
