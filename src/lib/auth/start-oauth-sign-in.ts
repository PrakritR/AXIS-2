import {
  APPLE_SIGN_IN_SUPABASE_SETUP_MESSAGE,
  resolveAppleWebOAuthSignIn,
} from "@/lib/auth/apple-sign-in-config";
import { persistOAuthSignInContext } from "@/lib/auth/oauth-next-cookie";
import { resolveOAuthCallbackRedirectUrl } from "@/lib/auth/native-oauth-callback";
import { oauthContinuePath, usesDirectOAuthReturn } from "@/lib/auth/oauth-redirect";
import { defaultOAuthNextPath, type OAuthSignInIntent } from "@/lib/auth/post-oauth-routing";
import { resolveOAuthBrowserOrigin } from "@/lib/auth/password-reset-url";
import { openOAuthUrl } from "@/lib/native/open-url";
import type { Provider } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

export type StartOAuthSignInParams = {
  supabase: SupabaseClient;
  provider: Provider;
  nextPath?: string;
  viaContinue?: boolean;
  fixedCallbackPath?: string;
  intent?: OAuthSignInIntent | null;
  onBeforeRedirect?: () => void;
};

export type StartOAuthSignInResult =
  | { ok: true }
  | { ok: false; message: string };

function providerLabel(provider: Provider): string {
  if (provider === "apple") return "Apple";
  if (provider === "google") return "Google";
  return provider;
}

export async function startOAuthSignIn({
  supabase,
  provider,
  nextPath = "",
  viaContinue = true,
  fixedCallbackPath,
  intent = null,
  onBeforeRedirect,
}: StartOAuthSignInParams): Promise<StartOAuthSignInResult> {
  const label = providerLabel(provider);
  try {
    onBeforeRedirect?.();
    const resolvedNext = nextPath.startsWith("/") ? nextPath : defaultOAuthNextPath(intent);
    const directReturn = !viaContinue || usesDirectOAuthReturn(resolvedNext);
    const afterAuth = directReturn
      ? resolvedNext.startsWith("/")
        ? resolvedNext
        : "/auth/continue"
      : oauthContinuePath(resolvedNext);
    const origin = resolveOAuthBrowserOrigin();
    const redirectTo =
      fixedCallbackPath && fixedCallbackPath.startsWith("/")
        ? resolveOAuthCallbackRedirectUrl(origin, fixedCallbackPath)
        : (() => {
            persistOAuthSignInContext({ nextPath: afterAuth, intent });
            return resolveOAuthCallbackRedirectUrl(origin);
          })();

    if (provider === "apple") {
      const resolved = await resolveAppleWebOAuthSignIn(supabase, redirectTo);
      if (!resolved.ok) return resolved;
      if (resolved.url) {
        await openOAuthUrl(resolved.url);
        return { ok: true };
      }
      return { ok: false, message: "Could not start Apple sign-in." };
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });
    if (error) {
      const lower = error.message.toLowerCase();
      let message = error.message;
      if (lower.includes("not enabled") || lower.includes("unsupported provider")) {
        message =
          provider === "apple"
            ? APPLE_SIGN_IN_SUPABASE_SETUP_MESSAGE
            : `${label} sign-in is not enabled in Supabase. Enable the ${label} provider in Authentication → Providers.`;
      }
      return { ok: false, message };
    }
    if (data?.url) {
      await openOAuthUrl(data.url);
      return { ok: true };
    }
    return { ok: false, message: `Could not start ${label} sign-in.` };
  } catch (e) {
    const message = e instanceof Error ? e.message : `Could not start ${label} sign-in.`;
    return {
      ok: false,
      message: message.includes("NEXT_PUBLIC_SUPABASE") ? "Supabase is not configured." : message,
    };
  }
}
