import { persistOAuthSignInContext } from "@/lib/auth/oauth-next-cookie";
import { resolveOAuthCallbackRedirectUrl } from "@/lib/auth/native-oauth-callback";
import { oauthContinuePath, usesDirectOAuthReturn } from "@/lib/auth/oauth-redirect";
import { defaultOAuthNextPath, type OAuthSignInIntent } from "@/lib/auth/post-oauth-routing";
import { resolveOAuthBrowserOrigin } from "@/lib/auth/password-reset-url";
import { openOAuthUrl } from "@/lib/native/open-url";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export type OAuthProviderId = "google" | "apple";

export type RunOAuthSignInParams = {
  provider: OAuthProviderId;
  nextPath?: string;
  viaContinue?: boolean;
  fixedCallbackPath?: string;
  intent?: OAuthSignInIntent | null;
  onBeforeRedirect?: () => void;
};

export type RunOAuthSignInResult =
  | { ok: true; opened: true }
  | { ok: false; message: string };

const PROVIDER_LABEL: Record<OAuthProviderId, string> = {
  google: "Google",
  apple: "Apple",
};

export async function runOAuthSignIn({
  provider,
  nextPath = "",
  viaContinue = true,
  fixedCallbackPath,
  intent = null,
  onBeforeRedirect,
}: RunOAuthSignInParams): Promise<RunOAuthSignInResult> {
  onBeforeRedirect?.();
  const supabase = createSupabaseBrowserClient();
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

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  const label = PROVIDER_LABEL[provider];

  if (error) {
    const message = error.message.toLowerCase().includes("not enabled")
      ? `${label} sign-in is not enabled in Supabase. Ask your admin to enable the ${label} provider.`
      : error.message;
    return { ok: false, message };
  }

  if (data?.url) {
    await openOAuthUrl(data.url);
    return { ok: true, opened: true };
  }

  return { ok: false, message: `Could not start ${label} sign-in.` };
}
