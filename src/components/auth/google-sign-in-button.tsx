"use client";

import { useAppUi } from "@/components/providers/app-ui-provider";
import { persistOAuthSignInContext } from "@/lib/auth/oauth-next-cookie";
import { resolveOAuthCallbackRedirectUrl } from "@/lib/auth/native-oauth-callback";
import {
  oauthContinuePath,
  usesDirectOAuthReturn,
} from "@/lib/auth/oauth-redirect";
import { defaultOAuthNextPath, type OAuthSignInIntent } from "@/lib/auth/post-oauth-routing";
import { resolveOAuthBrowserOrigin } from "@/lib/auth/password-reset-url";
import { openOAuthUrl } from "@/lib/native/open-url";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useEffect, useState } from "react";

function GoogleGlyph() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export function GoogleSignInButton({
  nextPath = "",
  disabled = false,
  label = "Continue with Google",
  /** When false, OAuth returns directly to nextPath instead of /auth/continue. */
  viaContinue = true,
  /** Fixed callback path (e.g. /auth/callback/partner-pricing) — no ?next= in redirect URL. */
  fixedCallbackPath,
  /** Sign-in intent — matches website manager/resident routing after Google OAuth. */
  intent = null,
  onBeforeRedirect,
}: {
  nextPath?: string;
  disabled?: boolean;
  label?: string;
  viaContinue?: boolean;
  fixedCallbackPath?: string;
  intent?: OAuthSignInIntent | null;
  onBeforeRedirect?: () => void;
}) {
  const { showToast } = useAppUi();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!busy) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        window.setTimeout(() => setBusy(false), 400);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [busy]);

  const signInWithGoogle = async () => {
    setBusy(true);
    try {
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
        provider: "google",
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          queryParams: {
            prompt: "select_account",
          },
        },
      });
      if (error) {
        const message = error.message.toLowerCase().includes("not enabled")
          ? "Google sign-in is not enabled in Supabase. Ask your admin to enable the Google provider."
          : error.message;
        showToast(message);
        setBusy(false);
        return;
      }
      if (data?.url) {
        await openOAuthUrl(data.url);
        window.setTimeout(() => setBusy(false), 90_000);
        return;
      }
      showToast("Could not start Google sign-in.");
      setBusy(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not start Google sign-in.";
      showToast(message.includes("NEXT_PUBLIC_SUPABASE") ? "Supabase is not configured." : message);
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void signInWithGoogle()}
      disabled={disabled || busy}
      className="flex w-full items-center justify-center gap-3 rounded-full border border-border bg-card px-4 py-2.5 text-[15px] font-semibold text-foreground shadow-[var(--shadow-sm)] transition hover:bg-accent/60 disabled:cursor-not-allowed disabled:opacity-60 sm:py-3 sm:text-sm"
    >
      <GoogleGlyph />
      {busy ? "Redirecting…" : label}
    </button>
  );
}
