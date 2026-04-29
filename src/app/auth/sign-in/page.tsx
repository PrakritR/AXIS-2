"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { portalDashboardPath, type AuthRole } from "@/components/auth/portal-switcher";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
  const router = useRouter();
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
      let { error } = await supabase.auth.signInWithPassword({
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
          error = retry.error;
        }
      }
      if (error) {
        showToast(friendlyAuthError(error.message));
        setBusy(false);
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        showToast("No active session.");
        setBusy(false);
        return;
      }
      let roles: AuthRole[] = [];
      try {
        const rolesRes = await fetch("/api/auth/portal-roles", { credentials: "include" });
        const rolesBody = (await rolesRes.json()) as { roles?: AuthRole[] };
        if (rolesRes.ok && rolesBody.roles?.length) {
          roles = rolesBody.roles;
        }
      } catch {
        /* fallback below */
      }
      if (roles.length === 0) {
        const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
        const role = (profile?.role as AuthRole | undefined) ?? "resident";
        roles = [role];
      }
      if (roles.length > 1) {
        const q = nextPath.startsWith("/") ? `?next=${encodeURIComponent(nextPath)}` : "";
        router.push(`/auth/choose-portal${q}`);
        router.refresh();
        return;
      }
      const role = roles[0] ?? "resident";
      const dest = nextPath.startsWith("/") ? nextPath : roleToPath(role);
      router.push(dest);
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sign-in failed";
      showToast(msg.includes("NEXT_PUBLIC_SUPABASE") ? "Supabase is not configured. Set env vars in .env.local." : msg);
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
