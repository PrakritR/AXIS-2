"use client";

import { AuthCard } from "@/components/auth/auth-card";
import {
  AuthBrandHeader,
  AuthDivider,
  AuthFieldBlock,
  AuthLoadingCard,
} from "@/components/auth/auth-mobile-primitives";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { ManagerPlanBillingToggle, ManagerPlanTierCards } from "@/components/auth/manager-plan-tier-cards";
import { PricingGoogleContinueButton } from "@/components/auth/pricing-google-continue-button";
import { EmbeddedCheckoutMount } from "@/components/stripe/embedded-checkout";
import { useAuthWelcomeChrome } from "@/components/auth/use-auth-welcome-chrome";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { MANAGER_PLAN_TIERS, type ManagerPlanTierDefinition, type PlanTierId } from "@/data/manager-plan-tiers";
import {
  buildPricingOffer,
  continuePartnerPricingWithOffer,
  type ContinuePartnerPricingResult,
} from "@/lib/auth/partner-pricing-google-flow";
import { partnerPricingFinishPath } from "@/lib/auth/resume-partner-pricing-oauth";
import { readManagerPricingOffer } from "@/lib/auth/manager-pricing-oauth-storage";
import { ResidentApplyPropertyPicker } from "@/components/auth/resident-apply-property-picker";
import { parseManagerApplicationLink } from "@/lib/auth/parse-resident-link";
import { buildRentalApplyHref } from "@/lib/rental-application/apply-from-listing";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { waitForOAuthUser } from "@/lib/auth/wait-for-oauth-user";
import { isNativeOAuthInProgress } from "@/lib/native/open-url";
import { getNativeInfo } from "@/lib/native/push-client";
import { loadManagerPlanTiers } from "@/lib/site-content";
import { MANAGER_SUBSCRIPTION_TRIAL_DAYS } from "@/lib/stripe/subscription-checkout-session";
import { stripeLiveJsBlockedMessage } from "@/lib/stripe/stripe-js-client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

type AuthMode = "sign-in" | "create";
type AccountRole = "resident" | "manager";

function tierById(tiers: ManagerPlanTierDefinition[], id: PlanTierId) {
  return tiers.find((t) => t.id === id) ?? tiers[0]!;
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
    <div className="native-auth-role-toggle flex rounded-full border border-border bg-card/40 p-1">
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useAppUi();
  useAuthWelcomeChrome(true);

  const modeParam = searchParams.get("mode");
  const initialMode: AuthMode =
    modeParam === "create" ? "create" : modeParam === "sign-in" ? "sign-in" : defaultMode;
  const initialRole = searchParams.get("role") === "manager" ? "manager" : "resident";
  const tierParam = searchParams.get("tier");
  const initialTier: PlanTierId =
    tierParam === "pro" || tierParam === "business" || tierParam === "free" ? tierParam : "free";
  const initialBilling: "monthly" | "annual" = searchParams.get("billing") === "annual" ? "annual" : "monthly";

  const [checkingSession, setCheckingSession] = useState(true);
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [role, setRole] = useState<AccountRole>(initialRole);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [applicationLink, setApplicationLink] = useState("");
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [stripeCheckoutBlocked, setStripeCheckoutBlocked] = useState<string | null>(null);

  const [billing, setBilling] = useState<"monthly" | "annual">(initialBilling);
  const [selectedTierId, setSelectedTierId] = useState<PlanTierId>(initialTier);
  const [planTiers, setPlanTiers] = useState(MANAGER_PLAN_TIERS);
  const [checkoutClientSecret, setCheckoutClientSecret] = useState<string | null>(null);

  const selectedTier = useMemo(() => tierById(planTiers, selectedTierId), [planTiers, selectedTierId]);
  const selectedPrice = billing === "monthly" ? selectedTier.monthly : selectedTier.annual;

  useEffect(() => {
    const remembered = readRememberedLoginEmail();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from stored login on mount
    if (remembered) setEmail(remembered);
    setStripeCheckoutBlocked(stripeLiveJsBlockedMessage());
  }, []);

  useEffect(() => {
    // If we arrived without an explicit ?tier= (e.g. the pricing redirect only persisted the
    // offer), preselect the plan the user picked on the pricing page.
    if (tierParam) return;
    const stored = readManagerPricingOffer();
    if (!stored) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from stored pricing offer
    setSelectedTierId(stored.tier);
    setBilling(stored.billing);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time mount hydration
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadManagerPlanTiers()
      .then((tiers) => {
        if (!cancelled) setPlanTiers(tiers);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset checkout when selection changes
    setCheckoutClientSecret(null);
  }, [selectedTierId, billing, role]);

  useEffect(() => {
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

  const applyPricingResult = useCallback(
    (result: ContinuePartnerPricingResult) => {
      if (result.status === "checkout") {
        if (stripeLiveJsBlockedMessage()) {
          showToast(stripeLiveJsBlockedMessage()!);
          return;
        }
        setCheckoutClientSecret(result.clientSecret);
        return;
      }
      if (result.status === "finish") {
        router.push(partnerPricingFinishPath(result.sessionId));
        return;
      }
      if (result.status === "portal") {
        window.location.replace("/portal/dashboard");
        return;
      }
      if (result.status === "error") showToast(result.message);
    },
    [router, showToast],
  );

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
      window.location.replace("/auth/continue");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sign-in failed";
      setErrorText(msg);
      showToast(msg);
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
      const body = (await res.json()) as { error?: string; redirectTo?: string; existingAccount?: boolean };
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
        setRole("manager");
        return;
      }
      if (body.existingAccount || body.redirectTo === "/portal/dashboard") {
        window.location.replace("/portal/dashboard");
        return;
      }
      const offer = buildPricingOffer({ tier: selectedTierId, billing, returnSurface: "mobile-plan" });
      applyPricingResult(await continuePartnerPricingWithOffer(offer));
    } catch {
      showToast("Network error.");
    } finally {
      setBusy(false);
    }
  };

  const startResidentApplication = () => {
    if (selectedPropertyId) {
      router.push(buildRentalApplyHref({ propertyId: selectedPropertyId }));
      return;
    }
    const parsed = parseManagerApplicationLink(applicationLink);
    if (parsed.kind === "invalid") {
      showToast(parsed.reason);
      return;
    }
    router.push(parsed.href);
  };

  const canStartResidentApplication = Boolean(selectedPropertyId || applicationLink.trim());

  if (checkingSession) {
    return (
      <AuthCard>
        <AuthLoadingCard />
      </AuthCard>
    );
  }

  const locked = busy;
  const isCreate = mode === "create";
  const managerCta = selectedTierId === "free" ? "Continue" : "Continue to payment";

  return (
    <AuthCard wide={isCreate}>
      <div className="native-auth-hub">
        <AuthBrandHeader />

        <div className="native-auth-hub-toggle-row mt-3">
          <AuthModeToggle mode={mode} onChange={setMode} disabled={locked} />
        </div>

        {mode === "sign-in" ? (
          <>
            <div className="native-auth-hub-toggle-row mt-3">
              <RoleToggle role={role} onChange={setRole} disabled={locked} />
            </div>
            <div className="mt-4">
              <GoogleSignInButton nextPath="" intent={role} disabled={locked} />
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
          </>
        ) : (
          <div className="mt-4 space-y-3">
            <RoleToggle role={role} onChange={setRole} disabled={locked} />

            {role === "resident" ? (
              <>
                <AuthFieldBlock label="Application link">
                  <Input
                    className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                    placeholder="https://…/rent/apply?…"
                    value={applicationLink}
                    onChange={(e) => {
                      setApplicationLink(e.target.value);
                      if (e.target.value.trim()) setSelectedPropertyId(null);
                    }}
                    autoComplete="off"
                    inputMode="url"
                    disabled={locked || Boolean(selectedPropertyId)}
                  />
                </AuthFieldBlock>
                <AuthDivider label="or select a house" />
                <ResidentApplyPropertyPicker
                  value={selectedPropertyId}
                  onChange={(id) => {
                    setSelectedPropertyId(id);
                    if (id) setApplicationLink("");
                  }}
                  disabled={locked}
                />
                <Button
                  type="button"
                  className="btn-cobalt w-full rounded-full py-2.5 text-[15px] font-semibold"
                  disabled={locked || !canStartResidentApplication}
                  onClick={startResidentApplication}
                >
                  Start an application
                </Button>
                <p className="text-center text-[12px] text-muted">
                  <Link
                    className="font-semibold text-primary hover:opacity-90"
                    href="/rent/browse?from=auth"
                  >
                    Browse all properties
                  </Link>
                </p>
              </>
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
                {selectedTierId !== "free" ? (
                  <p className="text-center text-[11px] text-muted">
                    {MANAGER_SUBSCRIPTION_TRIAL_DAYS}-day free trial, then {selectedPrice.headline}
                    {selectedPrice.period ?? ""}
                  </p>
                ) : null}
                {stripeCheckoutBlocked && selectedTierId !== "free" ? (
                  <p className="auth-stripe-dev-notice px-3 py-2 text-xs">{stripeCheckoutBlocked}</p>
                ) : null}
                <PricingGoogleContinueButton
                  tier={selectedTierId}
                  billing={billing}
                  disabled={locked || Boolean(stripeCheckoutBlocked && selectedTierId !== "free")}
                  returnSurface="mobile-plan"
                />
                <AuthDivider label="or email" />
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
                {checkoutClientSecret ? (
                  <div className="native-auth-payment-reveal mt-1 rounded-2xl border border-border bg-card/50 p-3">
                    <p className="mb-2 text-center text-xs font-semibold text-foreground">
                      Add a payment method to finish
                    </p>
                    <p className="mb-3 text-center text-[11px] text-muted">
                      {selectedTier.label} · {MANAGER_SUBSCRIPTION_TRIAL_DAYS}-day free trial, then{" "}
                      {selectedPrice.headline}
                      {selectedPrice.period ?? ""}
                    </p>
                    <EmbeddedCheckoutMount
                      clientSecret={checkoutClientSecret}
                      onError={(message) => {
                        showToast(message);
                        setCheckoutClientSecret(null);
                      }}
                    />
                    <button
                      type="button"
                      className="mt-3 block w-full text-center text-[13px] font-semibold text-primary/90"
                      onClick={() => setCheckoutClientSecret(null)}
                    >
                      ← Change plan
                    </button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    className="btn-cobalt w-full rounded-full py-2.5 text-[15px] font-semibold"
                    disabled={locked || Boolean(stripeCheckoutBlocked && selectedTierId !== "free")}
                    onClick={() => void createManager()}
                  >
                    {busy ? "Creating…" : managerCta}
                  </Button>
                )}
              </>
            )}
            {errorText ? <p className="text-center text-xs text-rose-600">{errorText}</p> : null}
          </div>
        )}
      </div>
    </AuthCard>
  );
}

export function NativeAuthHub({ defaultMode = "sign-in" }: { defaultMode?: AuthMode } = {}) {
  return (
    <Suspense
      fallback={
        <AuthCard>
          <AuthLoadingCard />
        </AuthCard>
      }
    >
      <NativeAuthHubInner defaultMode={defaultMode} />
    </Suspense>
  );
}
