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

const LOGIN_TIMEOUT_MS = 15000;
const PORTAL_LOAD_TIMEOUT_MS = 12000;

type SignInResult = {
  data: {
    user: { id: string } | null;
    session: unknown | null;
  };
  error: { message: string } | null;
};

type SessionResult = {
  data: {
    session: { user: { id: string } } | null;
  };
  error: Error | null;
};

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

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: number;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => window.clearTimeout(timeoutId));
}

async function fetchProfileAndRoles(
  supabase: ReturnType<typeof createSupabaseBrowserClient>,
  userId: string,
): Promise<{ profile: { role?: unknown } | null; roles: AuthRole[] }> {
  const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (profileError) throw profileError;
  console.log("profile loaded", profile);

  if (!profile) {
    throw new Error("Account found, but no portal profile is linked yet. Please contact Axis.");
  }

  const { data: roleRows, error: rolesError } = await supabase.from("profile_roles").select("role").eq("user_id", userId);
  if (rolesError) throw rolesError;
  const rows = (roleRows ?? []) as { role: unknown }[];

  const roles = [
    ...new Set(
      rows
        .map((row) => row.role)
        .filter((role): role is AuthRole => isAuthRole(role)),
    ),
  ];
  if (roles.length > 0) return { profile, roles };

  const legacyRole = profile && isAuthRole(profile.role) ? profile.role : null;
  if (legacyRole) return { profile, roles: [legacyRole] };

  throw new Error("Account found, but no portal profile is linked yet. Please contact Axis.");
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
    console.log("login started", { email: email.trim() });
    let didRedirect = false;
    try {
      const supabase = createSupabaseBrowserClient();
      let { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        }) as PromiseLike<SignInResult>,
        LOGIN_TIMEOUT_MS,
        "Login timed out. Please try again.",
      );
      console.log("supabase auth response", { userId: data.user?.id ?? null, hasSession: Boolean(data.session), error });
      if (error?.message.toLowerCase().includes("email not confirmed")) {
        const repaired = await tryResidentAutoConfirm(email);
        if (repaired) {
          const retry = await withTimeout(
            supabase.auth.signInWithPassword({
              email: email.trim(),
              password,
            }) as PromiseLike<SignInResult>,
            LOGIN_TIMEOUT_MS,
            "Login timed out. Please try again.",
          );
          data = retry.data;
          error = retry.error;
          console.log("supabase auth response", { userId: data.user?.id ?? null, hasSession: Boolean(data.session), error });
        }
      }
      if (error) {
        console.log("auth error", error);
        const message = friendlyAuthError(error.message);
        setErrorText(message);
        showToast(message);
        return;
      }

      setIsSigningIn(false);
      setIsLoadingPortal(true);
      const sessionResult = await withTimeout(
        supabase.auth.getSession() as PromiseLike<SessionResult>,
        PORTAL_LOAD_TIMEOUT_MS,
        "We could not finish loading your session. Please try again.",
      );
      console.log("session loaded", { hasSession: Boolean(sessionResult.data.session), error: sessionResult.error });
      if (sessionResult.error) throw sessionResult.error;

      const user = sessionResult.data.session?.user ?? data.user;
      if (!user) {
        throw new Error("No active session.");
      }

      const { roles } = await withTimeout(
        fetchProfileAndRoles(supabase, user.id),
        PORTAL_LOAD_TIMEOUT_MS,
        "We could not load your portal profile. Please try again.",
      );

      let redirectTarget: string;
      if (roles.length > 1) {
        const q = nextPath.startsWith("/") ? `?next=${encodeURIComponent(nextPath)}` : "";
        redirectTarget = `/auth/choose-portal${q}`;
      } else {
        const role = roles[0];
        if (!role) {
          throw new Error("Account found, but no portal profile is linked yet. Please contact Axis.");
        }
        redirectTarget = nextPath.startsWith("/") ? nextPath : roleToPath(role);
      }
      console.log("redirect target", redirectTarget);
      didRedirect = true;
      window.location.replace(redirectTarget);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sign-in failed";
      const message = msg.includes("NEXT_PUBLIC_SUPABASE")
        ? "Supabase is not configured. Set env vars in .env.local."
        : friendlyAuthError(msg);
      console.log("auth error", e);
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
