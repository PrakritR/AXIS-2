"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { portalDashboardPath, type AuthRole } from "@/components/auth/portal-switcher";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

const LOGIN_TIMEOUT_MS = 6000;
const PORTAL_LOAD_TIMEOUT_MS = 5000;

type SignInResult = {
  data: {
    user: { id: string; user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown> } | null;
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

function roleToPath(role: AuthRole): string {
  return portalDashboardPath(role);
}

function friendlyAuthError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("failed to fetch") || lower.includes("network") || lower.includes("fetch")) {
    return "We could not reach Supabase. Please check your connection and try again.";
  }
  return raw;
}

function isAuthRole(value: unknown): value is AuthRole {
  return value === "resident" || value === "manager" || value === "owner" || value === "admin";
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

async function fetchProfileAndRoles(
  supabase: ReturnType<typeof createSupabaseBrowserClient>,
  userId: string,
  userMetadata?: Record<string, unknown> | null,
  appMetadata?: Record<string, unknown> | null,
): Promise<{ profile: { role?: unknown } | null; roles: AuthRole[] }> {
  // Parallel fetch — profile and role rows are independent queries.
  const [profileResult, rolesResult] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", userId).maybeSingle(),
    supabase.from("profile_roles").select("role").eq("user_id", userId),
  ]);

  const profile = profileResult.data ?? null;

  const rows = ((rolesResult.data ?? []) as { role: unknown }[]);
  const roles = [...new Set(rows.map((r) => r.role).filter((r): r is AuthRole => isAuthRole(r)))];
  if (roles.length > 0) return { profile, roles };

  const legacyRole = isAuthRole(profile?.role) ? (profile!.role as AuthRole) : null;
  if (legacyRole) return { profile, roles: [legacyRole] };

  // Fall back to JWT metadata before giving up.
  const metaRole = userMetadata?.role ?? appMetadata?.role;
  if (isAuthRole(metaRole)) return { profile, roles: [metaRole] };

  // Default to resident — don't block sign-in for accounts without a profile row.
  return { profile, roles: ["resident"] };
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

function SignInForm() {
  const { showToast } = useAppUi();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isLoadingPortal, setIsLoadingPortal] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

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

      const { roles } = await withTimeout(
        fetchProfileAndRoles(supabase, user.id, user.user_metadata as Record<string, unknown>, user.app_metadata as Record<string, unknown>),
        PORTAL_LOAD_TIMEOUT_MS,
        "Could not load your portal — redirecting to default portal.",
      ).catch(() => ({ profile: null, roles: ["resident" as const] as AuthRole[] }));

      let redirectTarget: string;
      if (roles.length > 1) {
        const q = nextPath.startsWith("/") ? `?next=${encodeURIComponent(nextPath)}` : "";
        redirectTarget = `/auth/choose-portal${q}`;
      } else {
        const role = roles[0] ?? "resident";
        redirectTarget = nextPath.startsWith("/") ? nextPath : roleToPath(role);
      }
      didRedirect = true;
      window.location.replace(redirectTarget);
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

  return (
    <AuthCard>
      <h1 className="text-center text-[22px] font-bold tracking-tight text-[#0f172a]">Portal sign-in</h1>

      <div className="mt-8 space-y-4">
        <div>
          <label className="text-xs font-semibold text-[#334155]" htmlFor="email">
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
          <label className="text-xs font-semibold text-[#334155]" htmlFor="pw">
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
      </div>

      <div className="mt-5 text-sm">
        <Link className="font-semibold text-primary hover:opacity-90" href="/auth/forgot-password">
          Forgot password
        </Link>
      </div>

      {errorText ? <p className="mt-4 text-center text-sm text-rose-600">{errorText}</p> : null}

      <Button
        type="button"
        className="mt-6 w-full rounded-full py-3 text-base font-semibold"
        onClick={() => void handleSignIn()}
        disabled={busy}
      >
        {isSigningIn ? "Signing in…" : "Sign in"}
      </Button>
      {isLoadingPortal ? <p className="mt-3 text-center text-sm text-slate-500">Loading your portal...</p> : null}

      <p className="mt-8 text-center text-sm text-slate-600">
        New here?{" "}
        <Link className="font-semibold text-primary hover:opacity-90" href="/auth/create-account">
          Create account
        </Link>
      </p>
    </AuthCard>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<AuthCard><p className="text-center text-sm text-slate-600">Loading…</p></AuthCard>}>
      <SignInForm />
    </Suspense>
  );
}
