"use client";

import { AuthCard } from "@/components/auth/auth-card";
import {
  AuthBrandHeader,
  AuthDivider,
  AuthLegalConsent,
  AuthLoadingCard,
} from "@/components/auth/auth-mobile-primitives";
import { OAuthSocialStack } from "@/components/auth/oauth-social-stack";
import { ManagerTrialSignupForm } from "@/components/auth/manager-trial-signup-form";
import { ResidentSignupForm } from "@/components/auth/resident-signup-form";
import { useAuthWelcomeChrome } from "@/components/auth/use-auth-welcome-chrome";
import { VendorSignupForm } from "@/components/auth/vendor-signup-form";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { useIsNativeApp } from "@/hooks/use-is-native-app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { type PlanTierId } from "@/data/manager-plan-tiers";
import { readManagerPricingOffer } from "@/lib/auth/manager-pricing-oauth-storage";
import { oauthContinuePath } from "@/lib/auth/oauth-redirect";
import {
  parseOAuthSignInIntent,
  resolveSignInNextPath,
} from "@/lib/auth/post-oauth-routing";
import { detectNativePlatformSync } from "@/lib/native/detect-native";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { waitForOAuthUser } from "@/lib/auth/wait-for-oauth-user";
import { isNativeOAuthInProgress } from "@/lib/native/open-url";
import { getNativeInfo } from "@/lib/native/push-client";
import { portalNavClick } from "@/lib/portal-nav-client";
import { residentBrowseFromAuthHref } from "@/lib/resident-public-nav";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

type AuthMode = "sign-in" | "create";
type AccountRole = "resident" | "manager" | "vendor";
type AuthLayoutMode = "sign-in" | "create-compact";

function parseAccountRole(value: string | null): AccountRole {
  if (value === "manager") return "manager";
  if (value === "vendor") return "vendor";
  return "resident";
}

function isPlanTierId(value: string | null): value is PlanTierId {
  return value === "pro" || value === "business" || value === "free";
}

function stackMaxWidth(layoutMode: AuthLayoutMode): string {
  return layoutMode === "sign-in" ? "max-w-[460px]" : "max-w-[52rem]";
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
    <div className="native-auth-role-toggle flex rounded-full border border-border/60 bg-white/[0.06] p-1 backdrop-blur-md [html[data-theme=light]_&]:bg-white/50">
      {(
        [
          { id: "resident" as const, label: "Resident" },
          { id: "manager" as const, label: "Property" },
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

function scrollAuthMainToTop() {
  const main = document.querySelector<HTMLElement>(".auth-layout-main");
  main?.scrollTo({ top: 0, left: 0, behavior: "instant" });
}

function buildAuthHref(
  pathname: string,
  searchParams: URLSearchParams,
  opts: { mode?: AuthMode; role: AccountRole },
): string {
  const params = new URLSearchParams(searchParams.toString());
  params.set("role", opts.role);
  if (opts.mode === "create") {
    params.set("mode", "create");
  } else {
    params.delete("mode");
  }
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

type NativeAuthHubProps = {
  defaultMode?: AuthMode;
  inviteToken?: string;
  inviteEmail?: string;
  inviteFullName?: string;
};

function NativeAuthHubInner({
  defaultMode = "sign-in",
  inviteToken,
  inviteEmail = "",
  inviteFullName = "",
}: NativeAuthHubProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { showToast } = useAppUi();
  useAuthWelcomeChrome(true);

  const modeParam = searchParams.get("mode");
  const initialMode: AuthMode =
    modeParam === "create" ? "create" : modeParam === "sign-in" ? "sign-in" : defaultMode;
  const initialRole =
    pathname === "/auth/vendor-register"
      ? "vendor"
      : parseAccountRole(searchParams.get("role"));
  const tierParam = searchParams.get("tier");
  const explicitTier = isPlanTierId(tierParam) ? tierParam : null;
  const initialBilling: "monthly" | "annual" = searchParams.get("billing") === "annual" ? "annual" : "monthly";
  const googleSignedInReturn = searchParams.get("google_signed_in") === "1";
  const { isNative } = useIsNativeApp();

  const [checkingSession, setCheckingSession] = useState(true);
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [role, setRole] = useState<AccountRole>(initialRole);
  const [email, setEmail] = useState(inviteEmail);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [failedSignInAttempts, setFailedSignInAttempts] = useState(0);

  const nextFromUrl = searchParams.get("next")?.trim() ?? "";
  const signInIntent = parseOAuthSignInIntent(
    searchParams.get("intent") ?? searchParams.get("role"),
  );
  const signInNextPath = useMemo(
    () => resolveSignInNextPath(nextFromUrl, signInIntent),
    [nextFromUrl, signInIntent],
  );
  const signInContinueHref = useMemo(() => oauthContinuePath(signInNextPath), [signInNextPath]);
  const residentSignupNext = nextFromUrl.startsWith("/") ? nextFromUrl : "/resident/applications/apply";

  const [billing, setBilling] = useState<"monthly" | "annual">(initialBilling);
  const [selectedTierId, setSelectedTierId] = useState<PlanTierId>(explicitTier ?? "pro");

  const managerTrialSignup = selectedTierId !== "free";

  const isCreate = mode === "create";
  const skipSessionRedirect = isCreate;

  useEffect(() => {
    const remembered = readRememberedLoginEmail();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from stored login on mount
    if (remembered && !inviteEmail) setEmail(remembered);
  }, [inviteEmail]);

  useEffect(() => {
    const isCreateRoute =
      pathname === "/auth/create-account" ||
      pathname === "/auth/vendor-register" ||
      searchParams.get("mode") === "create" ||
      defaultMode === "create";
    const routeMode: AuthMode = isCreateRoute ? "create" : "sign-in";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync hub mode when auth route changes
    setMode(routeMode);
    scrollAuthMainToTop();
  }, [defaultMode, pathname, searchParams]);

  useEffect(() => {
    if (pathname === "/auth/vendor-register") {
      setRole("vendor");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync role tab from deep link
    setRole(parseAccountRole(searchParams.get("role")));
  }, [pathname, searchParams]);

  useEffect(() => {
    scrollAuthMainToTop();
  }, [mode, role]);

  useEffect(() => {
    if (explicitTier) {
      setSelectedTierId(explicitTier);
      const billingParam = searchParams.get("billing");
      if (billingParam === "monthly" || billingParam === "annual") {
        setBilling(billingParam);
      }
      return;
    }
    const stored = readManagerPricingOffer();
    if (stored?.tier) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from stored pricing offer
      setSelectedTierId(stored.tier);
      setBilling(stored.billing);
      return;
    }
    // Default manager signup: Pro 14-day trial, monthly billing.
    setSelectedTierId("pro");
    setBilling("monthly");
  }, [explicitTier, searchParams]);

  useEffect(() => {
    if (skipSessionRedirect) {
      setCheckingSession(false);
      return;
    }

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
          window.location.replace(signInContinueHref);
        }
      } finally {
        if (!cancelled) setCheckingSession(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [skipSessionRedirect, signInContinueHref]);

  useEffect(() => {
    if (checkingSession || skipSessionRedirect) return;

    const redirectAfterOAuth = async () => {
      if (!isNativeOAuthInProgress()) return;
      const supabase = createSupabaseBrowserClient();
      const user = await waitForOAuthUser(supabase, { attempts: 6, delayMs: 200 });
      if (user) window.location.replace(signInContinueHref);
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void redirectAfterOAuth();
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [checkingSession, skipSessionRedirect, signInContinueHref]);

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
      window.location.replace(signInContinueHref);
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
  const showForgotPassword = failedSignInAttempts >= 2;

  const createAccountHref = useMemo(
    () => buildAuthHref(pathname, searchParams, { mode: "create", role }),
    [pathname, role, searchParams],
  );
  const signInHref = useMemo(
    () => buildAuthHref(pathname === "/auth/create-account" ? "/auth/sign-in" : pathname, searchParams, { role }),
    [pathname, role, searchParams],
  );

  const handleRoleChange = useCallback(
    (nextRole: AccountRole) => {
      setRole(nextRole);
      const targetPath = isCreate
        ? pathname === "/auth/vendor-register"
          ? "/auth/create-account"
          : pathname
        : pathname === "/auth/sign-in"
          ? pathname
          : "/auth/create-account";
      router.replace(
        buildAuthHref(targetPath, searchParams, { mode: isCreate ? "create" : undefined, role: nextRole }),
      );
      requestAnimationFrame(scrollAuthMainToTop);
    },
    [isCreate, pathname, router, searchParams],
  );

  const openCreateAccount = useCallback(() => {
    setMode("create");
    router.push(createAccountHref);
    requestAnimationFrame(scrollAuthMainToTop);
  }, [createAccountHref, router]);

  const openSignIn = useCallback(() => {
    setMode("sign-in");
    router.push(signInHref);
    requestAnimationFrame(scrollAuthMainToTop);
  }, [router, signInHref]);

  const browseHomesHref = residentBrowseFromAuthHref();
  const onBrowseHomesClick = useMemo(
    () => portalNavClick(router, browseHomesHref, { preferFullNavigation: true }),
    [browseHomesHref, router],
  );

  const layoutMode: AuthLayoutMode = isCreate ? "create-compact" : "sign-in";

  if (checkingSession) {
    return (
      <div
        className={`native-auth-hub-stack mx-auto w-full ${stackMaxWidth(layoutMode)}`}
        data-auth-mode={layoutMode}
      >
        <AuthCard variant="blend">
          {isNative ? (
            <div className="auth-brand-header-wrap mb-4">
              <AuthBrandHeader homeLink />
            </div>
          ) : null}
          <AuthLoadingCard />
        </AuthCard>
      </div>
    );
  }

  const stackClassName = `native-auth-hub-stack mx-auto w-full self-center ${stackMaxWidth(layoutMode)}`;

  return (
    <div className={stackClassName} data-auth-mode={layoutMode}>
      <AuthCard variant="blend" wide={isCreate}>
        <div className="native-auth-hub">
          {isNative ? (
            <div className="auth-brand-header-wrap mb-4">
              <AuthBrandHeader homeLink />
            </div>
          ) : null}

          <div className={`space-y-3 ${isNative && !isCreate ? "" : isCreate ? "" : "mt-4"}`}>
            {isCreate ? <RoleToggle role={role} onChange={handleRoleChange} disabled={locked} /> : null}

            {isCreate ? (
              role === "resident" ? (
                <ResidentSignupForm
                  nextPath={residentSignupNext}
                  disabled={locked}
                  hideLegalFooter
                  initialEmail={email}
                />
              ) : role === "vendor" ? (
                <VendorSignupForm
                  variant="compact"
                  disabled={locked}
                  hideLegalFooter
                  inviteToken={inviteToken}
                  initialEmail={inviteEmail || email}
                  initialFullName={inviteFullName}
                />
              ) : (
                <ManagerTrialSignupForm
                  tier={selectedTierId}
                  billing={billing}
                  initialEmail={email}
                  disabled={locked}
                  hideLegalFooter
                  googleReturn={googleSignedInReturn}
                  trialSignup={managerTrialSignup}
                />
              )
            ) : (
              <>
                <OAuthSocialStack nextPath={signInNextPath} intent={signInIntent} disabled={locked} />
                <AuthDivider label="or enter your details" />
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
            )}
          </div>
        </div>
      </AuthCard>

      <div className="native-auth-hub-footer relative z-10 mt-5 space-y-3 text-center text-[12px]">
        {mode === "sign-in" ? (
          <p className="text-muted">
            Don&apos;t have an account?{" "}
            {isNative ? (
              <button
                type="button"
                onClick={openCreateAccount}
                data-attr="auth-hub-create-account"
                className="font-semibold text-primary hover:opacity-90"
              >
                Create your account
              </button>
            ) : (
              <Link
                className="font-semibold text-primary hover:opacity-90"
                href={createAccountHref}
                data-attr="auth-hub-create-account"
              >
                Create your account
              </Link>
            )}
          </p>
        ) : (
          <p className="text-muted">
            Already have an account?{" "}
            {isNative ? (
              <button
                type="button"
                onClick={openSignIn}
                data-attr="auth-hub-sign-in"
                className="font-semibold text-primary hover:opacity-90"
              >
                Sign in
              </button>
            ) : (
              <Link
                className="font-semibold text-primary hover:opacity-90"
                href={signInHref}
                data-attr="auth-hub-sign-in"
              >
                Sign in
              </Link>
            )}
          </p>
        )}
        <AuthLegalConsent action={mode === "sign-in" ? "continue" : "create"} className="px-1" />
        {isCreate && role === "resident" ? (
          <p>
            <Link
              href={browseHomesHref}
              onClick={onBrowseHomesClick}
              data-attr="resident-browse-homes"
              className="text-sm font-semibold text-primary hover:opacity-90"
            >
              Browse homes
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function NativeAuthHub(props: NativeAuthHubProps = {}) {
  const fallbackLayoutMode: AuthLayoutMode = props.defaultMode === "create" ? "create-compact" : "sign-in";
  return (
    <Suspense
      fallback={
        <div
          className={`native-auth-hub-stack mx-auto w-full ${stackMaxWidth(fallbackLayoutMode)}`}
          data-auth-mode={fallbackLayoutMode}
        >
          <AuthCard variant="blend">
            <AuthLoadingCard />
          </AuthCard>
        </div>
      }
    >
      <NativeAuthHubInner {...props} />
    </Suspense>
  );
}
