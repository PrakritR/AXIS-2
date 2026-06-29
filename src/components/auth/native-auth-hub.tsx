"use client";

import { AuthCard } from "@/components/auth/auth-card";
import {
  AuthAccountFooterLink,
  AuthBrandHeader,
  AuthDivider,
  AuthFieldBlock,
  AuthLoadingCard,
} from "@/components/auth/auth-mobile-primitives";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { ResidentGoogleSignUpButton } from "@/components/auth/resident-google-sign-up-button";
import { useAuthWelcomeChrome } from "@/components/auth/use-auth-welcome-chrome";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { parseManagerApplicationLink } from "@/lib/auth/parse-resident-link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getNativeInfo } from "@/lib/native/push-client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type AuthMode = "sign-in" | "create";
type AccountRole = "resident" | "manager";

const LOGIN_TIMEOUT_MS = 6000;

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

function AuthModeToggle({
  mode,
  onChange,
  disabled,
}: {
  mode: AuthMode;
  onChange: (mode: AuthMode) => void;
  disabled?: boolean;
}) {
  return (
    <div className="native-auth-mode-toggle flex rounded-full border border-border bg-card/40 p-1">
      {(
        [
          { id: "sign-in" as const, label: "Sign in" },
          { id: "create" as const, label: "Create account" },
        ] as const
      ).map((opt) => (
        <button
          key={opt.id}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.id)}
          className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold transition ${
            mode === opt.id ? "btn-cobalt shadow-sm" : "text-muted hover:text-foreground"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function RoleToggle({
  role,
  onChange,
  disabled,
}: {
  role: AccountRole;
  onChange: (role: AccountRole) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-2">
      {(
        [
          { id: "resident" as const, label: "Resident" },
          { id: "manager" as const, label: "Manager" },
        ] as const
      ).map((opt) => (
        <button
          key={opt.id}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.id)}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
            role === opt.id
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border text-muted hover:text-foreground"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function NativeAuthHubInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useAppUi();
  useAuthWelcomeChrome(true);

  const initialMode = searchParams.get("mode") === "create" ? "create" : "sign-in";
  const initialRole = searchParams.get("role") === "manager" ? "manager" : "resident";

  const [checkingSession, setCheckingSession] = useState(true);
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [role, setRole] = useState<AccountRole>(initialRole);
  const [email, setEmail] = useState(readRememberedLoginEmail);
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [axisId, setAxisId] = useState("");
  const [applicationLink, setApplicationLink] = useState("");
  const [showApply, setShowApply] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { isNative } = await getNativeInfo();
        if (!isNative) return;
        const supabase = createSupabaseBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!cancelled && session) {
          window.location.replace("/auth/continue");
        }
      } finally {
        if (!cancelled) setCheckingSession(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const oauthNext = role === "manager" ? "/portal/dashboard" : "/resident/dashboard";

  const signIn = async () => {
    if (!email.trim() || !password) {
      showToast("Enter email and password.");
      return;
    }
    setErrorText(null);
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
          const retry = await supabase.auth.signInWithPassword({ email: email.trim(), password });
          data = retry.data;
          error = retry.error;
        }
      }
      if (error) {
        setErrorText(error.message);
        showToast(error.message);
        return;
      }
      if (!data.user) throw new Error("No active session.");
      try {
        window.localStorage.setItem("axis:remembered-login-email", email.trim());
      } catch {
        /* ignore */
      }
      window.location.replace(`/auth/continue?next=${encodeURIComponent(oauthNext)}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sign-in failed";
      setErrorText(msg);
      showToast(msg);
    } finally {
      setBusy(false);
    }
  };

  const createResident = async () => {
    if (!email.trim() || !axisId.trim() || password.length < 8) {
      showToast("Enter email, Axis ID, and an 8+ character password.");
      return;
    }
    setErrorText(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/register-resident", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, axisId: axisId.trim() }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErrorText(body.error ?? "Could not create account.");
        showToast(body.error ?? "Could not create account.");
        return;
      }
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        showToast("Account created. Sign in to continue.");
        setMode("sign-in");
        return;
      }
      window.location.replace("/auth/continue?next=/resident/dashboard");
    } catch {
      showToast("Network error.");
    } finally {
      setBusy(false);
    }
  };

  const createManager = async () => {
    if (!fullName.trim() || !email.trim() || password.length < 8) {
      showToast("Enter your name, email, and an 8+ character password.");
      return;
    }
    setErrorText(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/manager-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, fullName: fullName.trim() }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErrorText(body.error ?? "Could not create account.");
        showToast(body.error ?? "Could not create account.");
        return;
      }
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        showToast("Account created. Sign in to pick your plan.");
        setMode("sign-in");
        setRole("manager");
        return;
      }
      window.location.replace("/auth/continue?next=/portal/plan");
    } catch {
      showToast("Network error.");
    } finally {
      setBusy(false);
    }
  };

  const continueApplyLink = () => {
    const parsed = parseManagerApplicationLink(applicationLink);
    if (parsed.kind === "invalid") {
      showToast(parsed.reason);
      return;
    }
    router.push(parsed.href);
  };

  if (checkingSession) {
    return (
      <AuthCard>
        <AuthLoadingCard />
      </AuthCard>
    );
  }

  const locked = busy;

  return (
    <AuthCard>
      <div className="native-auth-hub">
        <AuthBrandHeader
          title="Axis"
          subtitle={mode === "sign-in" ? "Welcome back" : "Set up your account in seconds"}
        />

        <div className="mt-5">
          <AuthModeToggle mode={mode} onChange={setMode} disabled={locked} />
        </div>

        <div className="mt-4">
          <GoogleSignInButton nextPath={oauthNext} disabled={locked} />
        </div>

        <div className="my-4">
          <AuthDivider label="or email" />
        </div>

        {mode === "sign-in" ? (
          <div className="space-y-3">
            <Input
              type="email"
              autoComplete="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={locked}
            />
            <PasswordInput
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={locked}
              onKeyDown={(e) => {
                if (e.key === "Enter") void signIn();
              }}
            />
            {errorText ? <p className="text-center text-xs text-rose-600">{errorText}</p> : null}
            <Button
              type="button"
              className="btn-cobalt w-full rounded-full py-2.5 text-[15px] font-semibold"
              disabled={locked}
              onClick={() => void signIn()}
            >
              {busy ? "Signing in…" : "Sign in"}
            </Button>
            <p className="text-center text-[12px] text-muted">
              <Link className="font-semibold text-primary hover:opacity-90" href="/auth/forgot-password">
                Forgot password?
              </Link>
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-muted">I am a</p>
              <RoleToggle role={role} onChange={setRole} disabled={locked} />
            </div>

            {role === "resident" ? (
              <>
                <Input
                  placeholder="Axis ID from your application"
                  value={axisId}
                  onChange={(e) => setAxisId(e.target.value)}
                  autoComplete="off"
                  disabled={locked}
                />
                <ResidentGoogleSignUpButton axisId={axisId} disabled={locked} />
                <AuthDivider label="or" />
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder="Email (same as application)"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={locked}
                />
                <PasswordInput
                  autoComplete="new-password"
                  placeholder="Password (8+ characters)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={locked}
                />
                <Button
                  type="button"
                  className="btn-cobalt w-full rounded-full py-2.5 text-[15px] font-semibold"
                  disabled={locked}
                  onClick={() => void createResident()}
                >
                  {busy ? "Creating…" : "Create resident account"}
                </Button>
                <button
                  type="button"
                  className="w-full text-center text-[12px] font-semibold text-primary/90"
                  onClick={() => setShowApply((v) => !v)}
                >
                  {showApply ? "Hide application link" : "Applying for the first time?"}
                </button>
                {showApply ? (
                  <div className="space-y-2 rounded-xl border border-border bg-card/40 p-3">
                    <AuthFieldBlock label="Manager application link">
                      <Input
                        className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                        placeholder="https://…/rent/apply?…"
                        value={applicationLink}
                        onChange={(e) => setApplicationLink(e.target.value)}
                        inputMode="url"
                        disabled={locked}
                      />
                    </AuthFieldBlock>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full rounded-full"
                      disabled={locked || !applicationLink.trim()}
                      onClick={continueApplyLink}
                    >
                      Open application
                    </Button>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <p className="text-xs leading-relaxed text-muted">
                  Create your login first — you&apos;ll pick Free, Pro, or Business inside your portal.
                </p>
                <Input
                  placeholder="Full name"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={locked}
                />
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={locked}
                />
                <PasswordInput
                  autoComplete="new-password"
                  placeholder="Password (8+ characters)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={locked}
                />
                <Button
                  type="button"
                  className="btn-cobalt w-full rounded-full py-2.5 text-[15px] font-semibold"
                  disabled={locked}
                  onClick={() => void createManager()}
                >
                  {busy ? "Creating…" : "Create manager account"}
                </Button>
              </>
            )}
            {errorText ? <p className="text-center text-xs text-rose-600">{errorText}</p> : null}
          </div>
        )}
      </div>
    </AuthCard>
  );
}

export function NativeAuthHub() {
  return (
    <Suspense
      fallback={
        <AuthCard>
          <AuthLoadingCard />
        </AuthCard>
      }
    >
      <NativeAuthHubInner />
    </Suspense>
  );
}
