"use client";

import { AuthCard } from "@/components/auth/auth-card";
import {
  AuthBrandHeader,
  AuthDivider,
  AuthLoadingCard,
} from "@/components/auth/auth-mobile-primitives";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { ManagerPlanBillingToggle, ManagerPlanTierCards } from "@/components/auth/manager-plan-tier-cards";
import { ManagerSignupPanel } from "@/components/auth/manager-signup-panel";
import { ResidentSignupForm } from "@/components/auth/resident-signup-form";
import { useAuthWelcomeChrome } from "@/components/auth/use-auth-welcome-chrome";
import { VendorSignupForm } from "@/components/auth/vendor-signup-form";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { useIsNativeApp } from "@/hooks/use-is-native-app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { MANAGER_PLAN_TIERS, type ManagerPlanTierDefinition, type PlanTierId } from "@/data/manager-plan-tiers";
import { readManagerPricingOffer } from "@/lib/auth/manager-pricing-oauth-storage";
import { detectNativePlatformSync } from "@/lib/native/detect-native";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { waitForOAuthUser } from "@/lib/auth/wait-for-oauth-user";
import { isNativeOAuthInProgress } from "@/lib/native/open-url";
import { getNativeInfo } from "@/lib/native/push-client";
import { loadManagerPlanTiers } from "@/lib/site-content";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type AuthMode = "sign-in" | "create";
type AccountRole = "resident" | "manager" | "vendor";

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
    <div className="native-auth-role-toggle flex rounded-full border border-border bg-card/40 p-1">
      {(
        [
          { id: "resident" as const, label: "Resident" },
          { id: "manager" as const, label: "Manager" },
          { id: "vendor" as const, label: "Vendor" },
        ] as const
      ).map((opt) => (
        <button
          key={opt.id}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.id)}
          className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold transition ${
            role === opt.id ? "btn-cobalt shadow-sm" : "text-muted hover:text-foreground"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function NativeAuthHubInner({ defaultMode = "sign-in" }: { defaultMode?: AuthMode }) {
  const searchParams = useSearchParams();
  const { showToast } = useAppUi();
  useAuthWelcomeChrome(true);

  const modeParam = searchParams.get("mode");
  const initialMode: AuthMode =
    modeParam === "create" ? "create" : modeParam === "sign-in" ? "sign-in" : defaultMode;
  const roleParam = searchParams.get("role");
  const initialRole: AccountRole = roleParam === "manager" ? "manager" : roleParam === "vendor" ? "vendor" : "resident";
  const tierParam = searchParams.get("tier");
  const initialTier: PlanTierId =
    tierParam === "pro" || tierParam === "business" || tierParam === "free" ? tierParam : "free";
  const initialBilling: "monthly" | "annual" = searchParams.get("billing") === "annual" ? "annual" : "monthly";
  const { isNative } = useIsNativeApp();

  const [checkingSession, setCheckingSession] = useState(true);
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [role, setRole] = useState<AccountRole>(initialRole);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [failedSignInAttempts, setFailedSignInAttempts] = useState(0);

  const nextFromUrl = searchParams.get("next")?.trim() ?? "";
  const residentSignupNext = nextFromUrl.startsWith("/") ? nextFromUrl : "/resident/applications";

  // Manager plan selection state — the plan picker + signup form render inline here
  // on both web and native.
  const [billing, setBilling] = useState<"monthly" | "annual">(initialBilling);
  const [selectedTierId, setSelectedTierId] = useState<PlanTierId>(initialTier);
  const [planTiers, setPlanTiers] = useState<ManagerPlanTierDefinition[]>(MANAGER_PLAN_TIERS);

  useEffect(() => {
    const remembered = readRememberedLoginEmail();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from stored login on mount
    if (remembered) setEmail(remembered);
  }, []);

  useEffect(() => {
    // If we arrived without an explicit ?tier= (e.g. a pricing redirect only persisted the
    // offer), preselect the plan the user picked earlier.
    if (tierParam) return;
    const stored = readManagerPricingOffer();
    if (!stored) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from stored pricing offer
    setSelectedTierId(stored.tier);
    setBilling(stored.billing);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time mount hydration
  }, []);

  useEffect(() => {
    if (role !== "manager") return;
    let cancelled = false;
    loadManagerPlanTiers()
      .then((tiers) => {
        if (!cancelled) setPlanTiers(tiers);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [role]);

  useEffect(() => {
    // Web browsers never need the native OAuth session probe — skip the Capacitor
    // dynamic import so the auth form renders immediately instead of on "Loading…".
    if (!detectNativePlatformSync()) {
      setCheckingSession(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const { isNative } = await getNativeInfo();
        if (!isNative || cancelled) return;
        if (isNativeOAuthInProgress()) {
          return;
        }
        const supabase = createSupabaseBrowserClient();
        const user = await waitForOAuthUser(supabase, { attempts: 4, delayMs: 200 });
        if (!cancelled && user) {
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

  useEffect(() => {
    if (checkingSession) return;

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
  }, [checkingSession]);

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
        setFailedSignInAttempts((n) => n + 1);
        showToast(error.message);
        return;
      }
      if (!data.user) throw new Error("No active session.");
      setFailedSignInAttempts(0);
      try {
        window.localStorage.setItem("axis:remembered-login-email", email.trim());
      } catch {
        /* ignore */
      }
      window.location.replace("/auth/continue");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sign-in failed";
      setErrorText(msg);
      setFailedSignInAttempts((n) => n + 1);
      showToast(msg);
    } finally {
      setBusy(false);
    }
  };

  const locked = busy;
  const isCreate = mode === "create";
  const showForgotPassword = failedSignInAttempts >= 2;
  const createAccountHref = (() => {
    const params = new URLSearchParams({ mode: "create", role: roleParam || "resident" });
    if (nextFromUrl.startsWith("/")) params.set("next", nextFromUrl);
    return `/auth/create-account?${params.toString()}`;
  })();
  const signInHref = (() => {
    const params = new URLSearchParams();
    if (nextFromUrl.startsWith("/")) params.set("next", nextFromUrl);
    const qs = params.toString();
    return qs ? `/auth/sign-in?${qs}` : "/auth/sign-in";
  })();

  if (checkingSession) {
    return (
      <div className="native-auth-hub-stack mx-auto w-full max-w-[460px]">
        <AuthCard>
          <AuthLoadingCard />
        </AuthCard>
      </div>
    );
  }

  const stackClassName = `native-auth-hub-stack mx-auto w-full ${isCreate ? "max-w-[52rem]" : "max-w-[460px]"}`;

  return (
    <div className={stackClassName}>
      <AuthCard wide={isCreate}>
        <div className="native-auth-hub">
          <AuthBrandHeader />

          {mode === "sign-in" ? (
            <>
              <div className="mt-4">
                <GoogleSignInButton nextPath="" intent={null} disabled={locked} />
              </div>
              <div className="my-4">
                <AuthDivider label="or email" />
              </div>
              <div className="space-y-3">
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setFailedSignInAttempts(0);
                    setErrorText(null);
                  }}
                  disabled={locked}
                />
                <div>
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
                  {showForgotPassword ? (
                    <p className="mt-1.5 text-right text-[12px]">
                      <Link className="font-semibold text-primary hover:opacity-90" href="/auth/forgot-password">
                        Forgot password?
                      </Link>
                    </p>
                  ) : null}
                </div>
                {errorText ? <p className="text-center text-xs text-rose-600">{errorText}</p> : null}
                <Button
                  type="button"
                  className="btn-cobalt w-full rounded-full py-2.5 text-[15px] font-semibold"
                  disabled={locked}
                  onClick={() => void signIn()}
                >
                  {busy ? "Signing in…" : "Sign in"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="mt-4 space-y-3">
                <RoleToggle role={role} onChange={setRole} disabled={locked} />

                {role === "resident" ? (
                  <ResidentSignupForm
                    nextPath={residentSignupNext}
                    showBrowseLink
                    disabled={locked}
                  />
                ) : role === "vendor" ? (
                  <VendorSignupForm variant="compact" disabled={locked} />
                ) : (
                  <>
                    <ManagerPlanBillingToggle billing={billing} onChange={setBilling} disabled={locked} />
                    <ManagerPlanTierCards
                      tiers={planTiers}
                      billing={billing}
                      selectedTierId={selectedTierId}
                      onSelectTier={setSelectedTierId}
                      disabled={locked}
                      compact
                    />
                    <ManagerSignupPanel
                      tier={selectedTierId}
                      billing={billing}
                      planTiers={planTiers}
                      returnSurface="mobile-plan"
                      initialEmail={email}
                    />
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </AuthCard>

      <div className="native-auth-hub-footer mt-5 space-y-2 text-center text-[12px]">
        {mode === "sign-in" ? (
          <p>
            <Link
              className="font-semibold text-primary hover:opacity-90"
              href={createAccountHref}
              data-attr="auth-hub-create-account"
            >
              Create your account
            </Link>
          </p>
        ) : (
          <p>
            <Link
              className="font-semibold text-primary hover:opacity-90"
              href={signInHref}
              data-attr="auth-hub-sign-in"
            >
              Sign in
            </Link>
          </p>
        )}
        {!isNative ? (
          <p>
            <Link
              className="font-semibold text-muted transition hover:text-foreground"
              href="/"
              data-attr="auth-back-to-home"
            >
              ← Back to home
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function NativeAuthHub({ defaultMode = "sign-in" }: { defaultMode?: AuthMode } = {}) {
  return (
    <Suspense
      fallback={
        <div className="native-auth-hub-stack mx-auto w-full max-w-[460px]">
          <AuthCard>
            <AuthLoadingCard />
          </AuthCard>
        </div>
      }
    >
      <NativeAuthHubInner defaultMode={defaultMode} />
    </Suspense>
  );
}
