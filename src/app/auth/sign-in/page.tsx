"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { AuthWelcomeScreen, shouldShowNativeWelcome } from "@/components/auth/auth-welcome-screen";
import { AuthPageHeader } from "@/components/auth/auth-mobile-primitives";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { usesDirectOAuthReturn } from "@/lib/auth/oauth-redirect";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { nativeAuthEntryPathClient } from "@/lib/auth/native-auth-entry";
import { detectNativePlatformSync } from "@/lib/native/detect-native";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

const LOGIN_TIMEOUT_MS = 6000;

type SignInResult = {
  data: {
    user: { id: string } | null;
    session: unknown | null;
  };
  error: { message: string } | null;
};

class AuthTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthTimeoutError";
  }
}

function friendlyAuthError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("failed to fetch") || lower.includes("network") || lower.includes("fetch")) {
    return "We could not reach Supabase. Please check your connection and try again.";
  }
  return raw;
}

function isAuthTimeoutError(value: unknown): value is AuthTimeoutError {
  return value instanceof AuthTimeoutError || (value instanceof Error && value.name === "AuthTimeoutError");
}

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId = 0;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new AuthTimeoutError(message)), timeoutMs);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => window.clearTimeout(timeoutId));
}

function continueHref(nextPath: string): string {
  if (!nextPath.startsWith("/")) return "/auth/continue";
  return `/auth/continue?next=${encodeURIComponent(nextPath)}`;
}

async function tryResidentAutoConfirm(email: string): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/confirm-resident-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function readRememberedLoginEmail(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem("axis:remembered-login-email") ?? "";
  } catch {
    return "";
  }
}

type SignInIntent = "resident" | "manager" | null;

function parseSignInIntent(value: string | null): SignInIntent {
  if (value === "resident" || value === "manager") return value;
  return null;
}

function signInCopy(intent: SignInIntent): { title: string; createAccountHref: string; backHref: string | null } {
  const entry = nativeAuthEntryPathClient();
  const isNative = Boolean(detectNativePlatformSync());
  if (intent === "resident") {
    return {
      title: "Resident sign-in",
      createAccountHref: isNative ? "/auth/resident" : "/auth/create-account",
      backHref: isNative ? entry : null,
    };
  }
  if (intent === "manager") {
    return {
      title: "Manager sign-in",
      createAccountHref: isNative ? "/auth/manager/plan" : "/partner/pricing",
      backHref: isNative ? entry : null,
    };
  }
  return {
    title: isNative ? "Sign in" : "Portal sign-in",
    createAccountHref: isNative ? entry : entry,
    backHref: null,
  };
}

function SignInForm() {
  const { showToast } = useAppUi();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "";
  const intent = parseSignInIntent(searchParams.get("intent"));
  const authError = searchParams.get("error");

  if (
    shouldShowNativeWelcome({
      intent: searchParams.get("intent"),
      next: nextPath,
      error: authError,
    })
  ) {
    return <AuthWelcomeScreen />;
  }

  const copy = signInCopy(intent);
  const oauthMessage = searchParams.get("message");

  const [email, setEmail] = useState(readRememberedLoginEmail);
  const [password, setPassword] = useState("");
  const [rememberEmail, setRememberEmail] = useState(() => Boolean(readRememberedLoginEmail()));
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isLoadingPortal, setIsLoadingPortal] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    void Promise.resolve().then(() => {
      if (authError === "oauth" && oauthMessage) {
        setErrorText(oauthMessage);
        return;
      }
      if (authError === "auth" || authError === "oauth") {
        setErrorText("Google sign-in could not be completed. Try again or use email and password.");
      }
    });
  }, [authError, oauthMessage]);

  const handleSignIn = async () => {
    if (!email.trim() || !password) {
      showToast("Enter email and password.");
      return;
    }
    setErrorText(null);
    setIsLoadingPortal(false);
    setIsSigningIn(true);
    let didRedirect = false;
    try {
      const supabase = createSupabaseBrowserClient();
      let authResult: SignInResult;
      try {
        authResult = await withTimeout(
          supabase.auth.signInWithPassword({ email: email.trim(), password }) as PromiseLike<SignInResult>,
          LOGIN_TIMEOUT_MS,
          "Login is taking too long. Please check your connection and try again.",
        );
      } catch (timeoutError) {
        if (!isAuthTimeoutError(timeoutError)) throw timeoutError;
        throw new Error("Login is taking too long. Please check your connection and try again.");
      }

      let { data, error } = authResult;
      if (error?.message.toLowerCase().includes("email not confirmed")) {
        const repaired = await tryResidentAutoConfirm(email);
        if (repaired) {
          const retry = await withTimeout(
            supabase.auth.signInWithPassword({ email: email.trim(), password }) as PromiseLike<SignInResult>,
            LOGIN_TIMEOUT_MS,
            "Login is taking too long. Please check your connection and try again.",
          );
          data = retry.data;
          error = retry.error;
        }
      }
      if (error) {
        const message = friendlyAuthError(error.message);
        setErrorText(message);
        showToast(message);
        return;
      }

      setIsSigningIn(false);
      setIsLoadingPortal(true);

      const user = data.user;
      if (!user) {
        throw new Error("No active session.");
      }
      if (rememberEmail) {
        window.localStorage.setItem("axis:remembered-login-email", email.trim());
      } else {
        window.localStorage.removeItem("axis:remembered-login-email");
      }
      didRedirect = true;
      window.location.replace(continueHref(oauthNext));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sign-in failed";
      const message = msg.includes("NEXT_PUBLIC_SUPABASE")
        ? "Supabase is not configured. Set env vars in .env.local."
        : friendlyAuthError(msg);
      setErrorText(message);
      showToast(message);
    } finally {
      if (!didRedirect) {
        setIsSigningIn(false);
        setIsLoadingPortal(false);
      }
    }
  };

  const busy = isSigningIn || isLoadingPortal;

  const defaultNext =
    intent === "resident" ? "/resident/dashboard" : intent === "manager" ? "/portal/dashboard" : "";
  const oauthNext = nextPath || defaultNext;

  return (
    <AuthCard>
      <AuthPageHeader title={copy.title} accent={!intent} showLogo />

      <div className="mt-5 sm:mt-6">
        <GoogleSignInButton
          nextPath={oauthNext}
          viaContinue={!usesDirectOAuthReturn(oauthNext)}
          disabled={busy}
        />
      </div>

      <div className="auth-divider my-4 flex items-center gap-3 sm:my-5">
        <div className="h-px flex-1 bg-border" aria-hidden />
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted sm:text-xs">or</span>
        <div className="h-px flex-1 bg-border" aria-hidden />
      </div>

      <div className="auth-form-stack space-y-3 sm:space-y-4">
        <div>
          <label className="text-xs font-semibold text-muted" htmlFor="email">
            Email
          </label>
          <Input
            id="email"
            className="mt-1.5"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted" htmlFor="pw">
            Password
          </label>
          <PasswordInput
            id="pw"
            className="mt-1.5"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="auth-remember-row hidden items-center gap-2 sm:flex">
          <input
            type="checkbox"
            id="remember-email"
            checked={rememberEmail}
            disabled={busy}
            onChange={(event) => setRememberEmail(event.target.checked)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          <label htmlFor="remember-email" className="text-sm text-muted">
            Remember email
          </label>
        </div>
      </div>

      <div className="mt-3 text-sm sm:mt-4">
        <Link className="font-semibold text-primary hover:opacity-90" href="/auth/forgot-password">
          Forgot password
        </Link>
      </div>

      {errorText ? <p className="mt-4 text-center text-sm text-rose-600">{errorText}</p> : null}

      <Button
        type="button"
        className="mt-4 w-full rounded-full py-2.5 text-[15px] font-semibold sm:mt-5 sm:py-3 sm:text-base"
        onClick={() => void handleSignIn()}
        disabled={busy}
      >
        {isSigningIn ? "Signing in…" : "Sign in"}
      </Button>
      {isLoadingPortal ? <p className="mt-2 text-center text-[13px] text-muted sm:mt-3 sm:text-sm">Loading…</p> : null}

      {!detectNativePlatformSync() || intent ? (
        <p className="auth-footer-link mt-4 text-center text-[13px] text-muted sm:mt-5 sm:text-sm">
          New here?{" "}
          <Link className="font-semibold text-primary hover:opacity-90" href={copy.createAccountHref}>
            {intent === "manager" ? "Choose a plan" : intent === "resident" ? "Resident setup" : "Get started"}
          </Link>
        </p>
      ) : null}

      {!detectNativePlatformSync() && copy.backHref ? (
        <p className="mt-3 text-center text-[13px] text-muted sm:mt-4 sm:text-sm">
          <Link className="font-semibold text-primary hover:opacity-90" href={copy.backHref}>
            Change role
          </Link>
        </p>
      ) : null}
    </AuthCard>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<AuthCard><p className="text-center text-sm text-muted">Loading…</p></AuthCard>}>
      <SignInForm />
    </Suspense>
  );
}
