import {
  IOS_BUNDLE_ID,
  mapNativeAppleOAuthErrorMessage,
  supabaseAppleOAuthRedirectUri,
} from "@/lib/auth/apple-sign-in-config";
import { sha256Hex } from "@/lib/crypto/sha256-hex";
import { readManagerPricingOffer } from "@/lib/auth/manager-pricing-oauth-storage";
import { oauthContinuePath, usesDirectOAuthReturn } from "@/lib/auth/oauth-redirect";
import { defaultOAuthNextPath, type OAuthSignInIntent } from "@/lib/auth/post-oauth-routing";
import { detectNativePlatformSync } from "@/lib/native/detect-native";
import { Capacitor } from "@capacitor/core";
import type { SupabaseClient } from "@supabase/supabase-js";

export type NativeAppleSignInResult =
  | { ok: true }
  | { ok: false; message: string; cancelled?: boolean };

/**
 * A deliberate dismissal of the Apple sheet, not a failure. `openOAuthUrl` already treats the
 * WebAuthSession `CANCELED` code as a silent no-op; callers branch on the `cancelled` flag so
 * this path answers the same question the same way, without matching on the copy.
 */
export const APPLE_SIGN_IN_CANCELLED_MESSAGE = "Apple sign-in was cancelled.";

/**
 * Did the USER dismiss the Apple sheet?
 *
 * Prefers the structured signal — ASAuthorizationError.canceled is 1001, which the plugin
 * surfaces as an error `code` — and only falls back to matching the human string, which is why
 * this is confined to the authorization call rather than applied to every throw in the flow.
 */
function isAppleAuthorizationCancellation(error: unknown, message: string): boolean {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
  if (code === "1001" || code.toUpperCase().includes("CANCEL")) return true;
  return message.toLowerCase().includes("cancel");
}


function randomString(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(length);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = "";
  for (let i = 0; i < length; i++) out += chars[bytes[i]! % chars.length];
  return out;
}

export function canUseNativeAppleSignIn(): boolean {
  return detectNativePlatformSync() === "ios";
}

/** True when the native SignInWithApple Capacitor plugin is linked in the current iOS build. */
export function isNativeApplePluginAvailable(): boolean {
  if (!canUseNativeAppleSignIn()) return false;
  try {
    return Capacitor.isPluginAvailable("SignInWithApple");
  } catch {
    return false;
  }
}

export const NATIVE_APPLE_REBUILD_MESSAGE =
  "Apple Sign In requires a fresh iOS build. Run npm run cap:ios:run in the project, then try again.";

/** Post-auth destination after native identityToken exchange (mirrors OAuth callback targets). */
export function resolveNativeApplePostAuthPath(opts: {
  nextPath?: string;
  viaContinue?: boolean;
  fixedCallbackPath?: string;
  intent?: OAuthSignInIntent | null;
}): string {
  const nextPath = opts.nextPath ?? "";
  const viaContinue = opts.viaContinue ?? true;
  const fixedCallbackPath = opts.fixedCallbackPath;

  if (fixedCallbackPath === "/auth/callback/resident-signup") {
    return "/auth/resident-oauth-finish";
  }
  if (fixedCallbackPath === "/auth/callback/vendor-signup") {
    return "/auth/vendor-oauth-finish";
  }
  if (fixedCallbackPath === "/auth/callback/partner-pricing") {
    const offer = readManagerPricingOffer();
    if (offer?.trialSignup) {
      const params = new URLSearchParams({
        mode: "create",
        role: "manager",
        google_signed_in: "1",
        tier: offer.tier,
        billing: offer.billing,
      });
      return `/auth/create-account?${params}`;
    }
    if (nextPath.startsWith("/")) return nextPath;
    return "/auth/manager-pricing-oauth";
  }

  const resolvedNext = nextPath.startsWith("/") ? nextPath : defaultOAuthNextPath(opts.intent);
  if (!viaContinue || usesDirectOAuthReturn(resolvedNext)) {
    return resolvedNext.startsWith("/") ? resolvedNext : "/auth/continue";
  }
  return oauthContinuePath(resolvedNext);
}

export async function runNativeAppleSignIn(
  supabase: SupabaseClient,
  opts: {
    nextPath?: string;
    viaContinue?: boolean;
    fixedCallbackPath?: string;
    intent?: OAuthSignInIntent | null;
  },
): Promise<NativeAppleSignInResult> {
  if (!canUseNativeAppleSignIn()) {
    return { ok: false, message: "Native Apple sign-in is only available on iOS." };
  }

  try {
    const { SignInWithApple } = await import("@capacitor-community/apple-sign-in");
    const rawNonce = randomString(32);
    const hashedNonce = await sha256Hex(rawNonce);

    // Cancellation is classified HERE, around the authorization call only. It used to be
    // inferred in the outer catch from `message.includes("cancel")`, which also spans
    // `signInWithIdToken` / `updateUser` — and on iOS an aborted request surfaces as
    // NSURLErrorCancelled, so backgrounding the app mid-token-exchange was reported as a user
    // cancellation. Since cancellation is silent, that turned a real network failure into a
    // blank screen: the exact silent failure this whole change removes.
    let result: Awaited<ReturnType<typeof SignInWithApple.authorize>>;
    try {
      result = await SignInWithApple.authorize({
        clientId: IOS_BUNDLE_ID,
        redirectURI: supabaseAppleOAuthRedirectUri(),
        scopes: "email name",
        state: randomString(16),
        nonce: hashedNonce,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Apple sign-in failed.";
      if (isAppleAuthorizationCancellation(e, message)) {
        return { ok: false, message: APPLE_SIGN_IN_CANCELLED_MESSAGE, cancelled: true };
      }
      if (message.toLowerCase().includes("not implemented")) {
        return { ok: false, message: NATIVE_APPLE_REBUILD_MESSAGE };
      }
      return { ok: false, message };
    }

    const identityToken = result.response?.identityToken?.trim();
    if (!identityToken) {
      return { ok: false, message: "Apple sign-in did not return an identity token." };
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: "apple",
      token: identityToken,
      nonce: rawNonce,
    });

    if (error) {
      return { ok: false, message: mapNativeAppleOAuthErrorMessage(error.message) };
    }

    const givenName = result.response?.givenName?.trim() ?? "";
    const familyName = result.response?.familyName?.trim() ?? "";
    const fullName = [givenName, familyName].filter(Boolean).join(" ").trim();
    if (fullName && data.user && !data.user.user_metadata?.full_name) {
      await supabase.auth.updateUser({ data: { full_name: fullName } });
    }

    const destination = resolveNativeApplePostAuthPath(opts);
    window.location.replace(destination);
    return { ok: true };
  } catch (e) {
    // Deliberately does NOT classify cancellation: anything thrown past the authorization step
    // came from the token exchange or profile update, and must surface as a real error even
    // when the platform words it "cancelled" (NSURLErrorCancelled).
    const message = e instanceof Error ? e.message : "Apple sign-in failed.";
    if (message.toLowerCase().includes("not implemented")) {
      return { ok: false, message: NATIVE_APPLE_REBUILD_MESSAGE };
    }
    return { ok: false, message };
  }
}
