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

function roleToPath(role: string): string {
  const r = role as AuthRole;
  return portalDashboardPath(r);
}

function friendlyAuthError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("invalid login") || lower.includes("invalid credentials")) {
    return "Incorrect email or password. Try again or use Forgot password.";
  }
  return raw;
}

function isAuthRole(value: unknown): value is AuthRole {
  return value === "resident" || value === "manager" || value === "owner" || value === "admin";
}

function fallbackRolesFromUser(user: { user_metadata?: Record<string, unknown> | null; app_metadata?: Record<string, unknown> | null }): AuthRole[] {
  const role = user.user_metadata?.role ?? user.app_metadata?.role;
  return isAuthRole(role) ? [role] : [];
}

async function fetchPortalRolesFast(): Promise<AuthRole[] | null> {
  try {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 1200);
    const res = await fetch("/api/auth/portal-roles", {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    });
    window.clearTimeout(timeout);
    if (!res.ok) return null;
    const body = (await res.json()) as { roles?: AuthRole[] };
    return Array.isArray(body.roles) ? body.roles : null;
  } catch {
    return null;
  }
}

async function fetchLegacyProfileRoleFast(
  supabase: ReturnType<typeof createSupabaseBrowserClient>,
  userId: string,
): Promise<AuthRole | null> {
  try {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
    return isAuthRole(profile?.role) ? profile.role : null;
  } catch {
    return null;
  }
}

async function resolvePortalRoles(
  supabase: ReturnType<typeof createSupabaseBrowserClient>,
  user: { id: string; user_metadata?: Record<string, unknown> | null; app_metadata?: Record<string, unknown> | null },
): Promise<AuthRole[]> {
  const fromPortalRoute = await fetchPortalRolesFast();
  if (fromPortalRoute && fromPortalRoute.length > 0) return fromPortalRoute;

  const fromMetadata = fallbackRolesFromUser(user);
  if (fromMetadata.length > 0) return fromMetadata;

  const legacyRole = await fetchLegacyProfileRoleFast(supabase, user.id);
  return legacyRole ? [legacyRole] : ["resident"];
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
  const [busy, setBusy] = useState(false);

  const handleSignIn = async () => {
    if (!email.trim() || !password) {
      showToast("Enter email and password.");
      return;
    }
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      let { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error?.message.toLowerCase().includes("email not confirmed")) {
        const repaired = await tryResidentAutoConfirm(email);
        if (repaired) {
          const retry = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });
          data = retry.data;
          error = retry.error;
        }
      }
      if (error) {
        showToast(friendlyAuthError(error.message));
        setBusy(false);
        return;
      }
      const user = data.user;
      if (!user) {
        showToast("No active session.");
        setBusy(false);
        return;
      }

      const roles = await resolvePortalRoles(supabase, user);
      if (roles.length > 1) {
        const q = nextPath.startsWith("/") ? `?next=${encodeURIComponent(nextPath)}` : "";
        window.location.assign(`/auth/choose-portal${q}`);
        return;
      }
      const role = roles[0] ?? "resident";
      const dest = nextPath.startsWith("/") ? nextPath : roleToPath(role);
      window.location.assign(dest);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sign-in failed";
      if (msg.toLowerCase().includes("failed to fetch")) {
        showToast("Signed in, but the portal is taking too long to load. Please try again.");
      } else {
        showToast(msg.includes("NEXT_PUBLIC_SUPABASE") ? "Supabase is not configured. Set env vars in .env.local." : msg);
      }
    } finally {
      setBusy(false);
    }
  };

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
          />
        </div>
      </div>

      <div className="mt-5 text-sm">
        <Link className="font-semibold text-primary hover:opacity-90" href="/auth/forgot-password">
          Forgot password
        </Link>
      </div>

      <Button
        type="button"
        className="mt-6 w-full rounded-full py-3 text-base font-semibold"
        onClick={() => void handleSignIn()}
        disabled={busy}
      >
        {busy ? "Signing in…" : "Sign in"}
      </Button>

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
