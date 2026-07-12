"use client";

import posthog from "posthog-js";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthDivider, AuthLegalConsent, AuthPageHeader } from "@/components/auth/auth-mobile-primitives";
import { OAuthSocialStack } from "@/components/auth/oauth-social-stack";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { waitForOAuthUser } from "@/lib/auth/wait-for-oauth-user";
import { isNativeOAuthInProgress } from "@/lib/native/open-url";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const LOGIN_TIMEOUT_MS = 6000;
const REMEMBERED_EMAIL_KEY = "axis:remembered-login-email";

type SignInResult = {
  data: { user: { id: string } | null; session: unknown | null };
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
    return "We could not reach PropLane. Please check your connection and try again.";
  }
  if (raw.includes("NEXT_PUBLIC_SUPABASE")) return "PropLane auth is not configured. Set env vars in .env.local.";
  return raw;
}

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId = 0;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new AuthTimeoutError(message)), timeoutMs);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => window.clearTimeout(timeoutId));
}

function readRememberedEmail(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
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

/**
 * The single portal auth surface for every account type — one clean screen used by both
 * /auth/sign-in and /auth/create-account, web and native. Role and plan are resolved
 * AFTER authentication (the single engine + /auth/get-started chooser), so this screen
 * has no role toggle, no plan selection, and no "change role" affordance.
 */
export function PortalAuthForm({ mode }: { mode: "sign-in" | "create" }) {
  const { showToast } = useAppUi();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "";
  const isCreate = mode === "create";

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  // Surface any OAuth callback error passed back via ?error=oauth&message=...
  const [errorText, setErrorText] = useState<string | null>(() => {
    const authError = searchParams.get("error");
    const oauthMessage = searchParams.get("message");
    if (authError === "oauth" && oauthMessage) return oauthMessage;
    if (authError === "auth" || authError === "oauth") {
      return "Sign-in could not be completed. Try again or use email and password.";
    }
    return null;
  });

  useEffect(() => {
    if (isCreate) return;
    const remembered = readRememberedEmail();
    if (remembered) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from stored login
      setEmail(remembered);
    }
  }, [isCreate]);

  // Native shell returns to this screen after the OAuth browser tab closes; finish routing.
  useEffect(() => {
    const redirectAfterOAuth = async () => {
      if (!isNativeOAuthInProgress()) return;
      const supabase = createSupabaseBrowserClient();
      const user = await waitForOAuthUser(supabase, { attempts: 6, delayMs: 200 });
      if (user) window.location.replace("/auth/continue");
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void redirectAfterOAuth();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const handleSignIn = async () => {
    if (!email.trim() || !password) {
      showToast("Enter email and password.");
      return;
    }
    setErrorText(null);
    setBusy(true);
    let didRedirect = false;
    try {
      const supabase = createSupabaseBrowserClient();
      let authResult = await withTimeout(
        supabase.auth.signInWithPassword({ email: email.trim(), password }) as PromiseLike<SignInResult>,
        LOGIN_TIMEOUT_MS,
        "Login is taking too long. Please check your connection and try again.",
      );
      if (authResult.error?.message.toLowerCase().includes("email not confirmed")) {
        if (await tryResidentAutoConfirm(email)) {
          authResult = await withTimeout(
            supabase.auth.signInWithPassword({ email: email.trim(), password }) as PromiseLike<SignInResult>,
            LOGIN_TIMEOUT_MS,
            "Login is taking too long. Please check your connection and try again.",
          );
        }
      }
      if (authResult.error) {
        const message = friendlyAuthError(authResult.error.message);
        setErrorText(message);
        showToast(message);
        return;
      }
      const user = authResult.data.user;
      if (!user) throw new Error("No active session.");
      posthog.identify(user.id);
      try {
        window.localStorage.setItem(REMEMBERED_EMAIL_KEY, email.trim());
      } catch {
        /* ignore */
      }
      await supabase.auth.refreshSession().catch(() => undefined);
      await supabase.auth.getSession();
      didRedirect = true;
      window.location.replace(continueHref(nextPath));
    } catch (e) {
      const message = friendlyAuthError(e instanceof Error ? e.message : "Sign-in failed");
      setErrorText(message);
      showToast(message);
    } finally {
      if (!didRedirect) setBusy(false);
    }
  };

  const handleCreate = async () => {
    if (!email.trim() || password.length < 8) {
      showToast("Enter your email and a password of at least 8 characters.");
      return;
    }
    setErrorText(null);
    setBusy(true);
    let didRedirect = false;
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, fullName: fullName.trim() || undefined }),
      });
      const body = (await res.json()) as { error?: string; existingAccount?: boolean };
      if (!res.ok) {
        const message = body.error ?? "Could not create your account.";
        setErrorText(message);
        showToast(message);
        return;
      }
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({ email: email.trim(), password }) as PromiseLike<SignInResult>,
        LOGIN_TIMEOUT_MS,
        "This is taking too long. Please check your connection and try again.",
      );
      if (error || !data.user) {
        showToast("Account created. Sign in to continue.");
        window.location.replace("/auth/sign-in");
        return;
      }
      posthog.identify(data.user.id);
      didRedirect = true;
      // Existing accounts already have a role — resolve it; brand-new accounts have none
      // and land on the role chooser via the single engine.
      window.location.replace(body.existingAccount ? "/auth/continue" : "/auth/get-started");
    } catch (e) {
      const message = friendlyAuthError(e instanceof Error ? e.message : "Sign up failed");
      setErrorText(message);
      showToast(message);
    } finally {
      if (!didRedirect) setBusy(false);
    }
  };

  const submit = isCreate ? handleCreate : handleSignIn;

  return (
    <AuthCard>
      <AuthPageHeader
        showLogo
        title={isCreate ? "Create your account" : "Portal sign-in"}
        subtitle={isCreate ? "One account for managers and residents" : undefined}
        accent={!isCreate}
      />

      <div className="mt-5 sm:mt-6">
        <OAuthSocialStack nextPath={nextPath} disabled={busy} />
      </div>

      <div className="my-4 sm:my-5">
        <AuthDivider />
      </div>

      <div className="space-y-3 sm:space-y-4">
        {isCreate ? (
          <div>
            <label className="text-xs font-semibold text-muted" htmlFor="full-name">
              Full name
            </label>
            <Input
              id="full-name"
              className="mt-1.5"
              autoComplete="name"
              placeholder="Your name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={busy}
            />
          </div>
        ) : null}
        <div>
          <label className="text-xs font-semibold text-muted" htmlFor="email">
            Email
          </label>
          <Input
            id="email"
            className="mt-1.5"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted" htmlFor="password">
            {isCreate ? "Create password" : "Password"}
          </label>
          <PasswordInput
            id="password"
            className="mt-1.5"
            autoComplete={isCreate ? "new-password" : "current-password"}
            placeholder={isCreate ? "Minimum 8 characters" : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
          />
        </div>
      </div>

      {!isCreate ? (
        <div className="mt-3 text-sm sm:mt-4">
          <Link className="font-semibold text-primary hover:opacity-90" href="/auth/forgot-password">
            Forgot password
          </Link>
        </div>
      ) : null}

      {errorText ? <p className="mt-4 text-center text-sm text-rose-600">{errorText}</p> : null}

      <Button
        type="button"
        className="mt-4 w-full rounded-full py-2.5 text-[15px] font-semibold sm:mt-5 sm:py-3 sm:text-base"
        onClick={() => void submit()}
        disabled={busy}
      >
        {busy ? (isCreate ? "Creating…" : "Signing in…") : isCreate ? "Create account" : "Sign in"}
      </Button>

      <p className="mt-5 text-center text-[13px] text-muted sm:mt-6 sm:text-sm">
        {isCreate ? (
          <>
            Already have an account?{" "}
            <Link className="font-semibold text-primary hover:opacity-90" href="/auth/sign-in">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link className="font-semibold text-primary hover:opacity-90" href="/auth/create-account">
              Get started
            </Link>
          </>
        )}
      </p>

      <AuthLegalConsent action={isCreate ? "create" : "continue"} className="mt-4 sm:mt-5" />
    </AuthCard>
  );
}
