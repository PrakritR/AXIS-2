"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { GoogleSignedInBanner } from "@/components/auth/google-signed-in-banner";
import { AuthAccountFooterLink, AuthDivider, AuthPageHeader } from "@/components/auth/auth-mobile-primitives";
import { ManagerPlanBillingToggle, ManagerPlanTierCards } from "@/components/auth/manager-plan-tier-cards";
import { PricingGoogleContinueButton } from "@/components/auth/pricing-google-continue-button";
import { EmbeddedCheckoutMount } from "@/components/stripe/embedded-checkout";
import { SubscriptionCheckoutHint } from "@/components/stripe/subscription-checkout-hint";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import {
  buildPricingOffer,
  continuePartnerPricingWithOffer,
  fetchPartnerPricingSession,
  handleGoogleSignedInReturn,
  type ContinuePartnerPricingResult,
  type PartnerPricingSession,
} from "@/lib/auth/partner-pricing-google-flow";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { detectNativePlatformSync } from "@/lib/native/detect-native";
import {
  clearManagerPricingOffer,
  persistManagerPricingOffer,
  readManagerPricingOffer,
} from "@/lib/auth/manager-pricing-oauth-storage";
import { partnerPricingFinishPath } from "@/lib/auth/resume-partner-pricing-oauth";
import { MANAGER_PLAN_TIERS, isPlanTierId, type ManagerPlanTierDefinition, type PlanTierId } from "@/data/manager-plan-tiers";
import { loadManagerPlanTiers } from "@/lib/site-content";
import { MANAGER_SUBSCRIPTION_TRIAL_DAYS } from "@/lib/stripe/subscription-checkout-session";
import { stripeLiveJsBlockedMessage } from "@/lib/stripe/stripe-js-client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

function tierById(tiers: ManagerPlanTierDefinition[], id: PlanTierId) {
  return tiers.find((t) => t.id === id) ?? tiers[0]!;
}

function defaultTier(): PlanTierId {
  return detectNativePlatformSync() ? "free" : "pro";
}

function ManagerPlanPickerInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useAppUi();

  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [selectedTierId, setSelectedTierId] = useState<PlanTierId>(defaultTier);
  const [planTiers, setPlanTiers] = useState(MANAGER_PLAN_TIERS);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutClientSecret, setCheckoutClientSecret] = useState<string | null>(null);
  const [googleCheckoutBusy, setGoogleCheckoutBusy] = useState(false);
  const [session, setSession] = useState<PartnerPricingSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailSignupBusy, setEmailSignupBusy] = useState(false);

  const sessionSignedIn = Boolean(session?.authenticated);
  const pricingComplete = sessionSignedIn && session != null && !session.needsPricing;
  const isPaidTier = selectedTierId !== "free";
  const requiresPaymentSetup = !pricingComplete;
  const stripeCheckoutBlocked =
    typeof window !== "undefined" ? stripeLiveJsBlockedMessage() : null;
  const checkoutLocked = checkoutBusy || googleCheckoutBusy || emailSignupBusy || Boolean(checkoutClientSecret);

  const selected = useMemo(() => tierById(planTiers, selectedTierId), [planTiers, selectedTierId]);
  const price = billing === "monthly" ? selected.monthly : selected.annual;

  const persistOffer = useCallback(() => {
    persistManagerPricingOffer(
      buildPricingOffer({ tier: selectedTierId, billing, returnSurface: "mobile-plan" }),
    );
  }, [billing, selectedTierId]);

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
    const tier = searchParams.get("tier");
    if (tier && isPlanTierId(tier)) setSelectedTierId(tier);
    const billing = searchParams.get("billing");
    if (billing === "monthly" || billing === "annual") setBilling(billing);
  }, [searchParams]);

  useEffect(() => {
    void fetchPartnerPricingSession().then((next) => {
      setSession(next);
      if (next.email) setEmail(next.email);
      if (next.fullName) setFullName(next.fullName);
      setSessionLoading(false);
    });
  }, []);

  useEffect(() => {
    persistOffer();
  }, [persistOffer]);

  useEffect(() => {
    setCheckoutClientSecret(null);
  }, [selectedTierId, billing]);

  const onEmbeddedError = useCallback(
    (message: string) => {
      showToast(message);
      setCheckoutClientSecret(null);
    },
    [showToast],
  );

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

  useEffect(() => {
    if (searchParams.get("google_signed_in") !== "1" && searchParams.get("google_checkout") !== "1") return;

    let cancelled = false;
    void (async () => {
      setGoogleCheckoutBusy(true);
      try {
        const stored = readManagerPricingOffer();
        if (stored) {
          setSelectedTierId(stored.tier);
          setBilling(stored.billing);
        }

        const result = await handleGoogleSignedInReturn();
        if (cancelled) return;

        const nextSession = await fetchPartnerPricingSession();
        if (cancelled) return;
        setSession(nextSession);

        if (result.status !== "provisioned") {
          if (result.status === "error") showToast(result.message);
          return;
        }

        const offer = stored ?? buildPricingOffer({ tier: selectedTierId, billing, returnSurface: "mobile-plan" });
        applyPricingResult(await continuePartnerPricingWithOffer(offer));
      } finally {
        if (!cancelled) setGoogleCheckoutBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyPricingResult, billing, searchParams, selectedTierId, showToast]);

  useEffect(() => {
    const sid = searchParams.get("session_id");
    if (!sid) return;
    clearManagerPricingOffer();
    router.replace(`/auth/manager-id?session_id=${encodeURIComponent(sid)}`);
  }, [router, searchParams]);

  const continueSignedIn = useCallback(async () => {
    setCheckoutBusy(true);
    try {
      const offer = buildPricingOffer({ tier: selectedTierId, billing, returnSurface: "mobile-plan" });
      applyPricingResult(await continuePartnerPricingWithOffer(offer));
    } finally {
      setCheckoutBusy(false);
    }
  }, [applyPricingResult, billing, selectedTierId]);

  const submitEmailSignup = useCallback(async () => {
    if (!fullName.trim() || !email.trim()) {
      showToast("Enter your name and email.");
      return;
    }
    if (password.length < 8) {
      showToast("Password must be at least 8 characters.");
      return;
    }

    setEmailSignupBusy(true);
    try {
      const res = await fetch("/api/auth/manager-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, fullName: fullName.trim() }),
      });
      const body = (await res.json()) as { error?: string; redirectTo?: string; existingAccount?: boolean };
      if (!res.ok) {
        showToast(body.error ?? "Could not create account.");
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        showToast("Account created. Sign in to continue.");
        router.push("/auth/manager");
        return;
      }

      if (body.existingAccount || body.redirectTo === "/portal/dashboard") {
        window.location.replace("/portal/dashboard");
        return;
      }

      setSession(await fetchPartnerPricingSession());
      const offer = buildPricingOffer({ tier: selectedTierId, billing, returnSurface: "mobile-plan" });
      applyPricingResult(await continuePartnerPricingWithOffer(offer));
    } catch {
      showToast("Network error.");
    } finally {
      setEmailSignupBusy(false);
    }
  }, [applyPricingResult, billing, email, fullName, password, router, selectedTierId, showToast]);

  if (checkoutClientSecret) {
    return (
      <AuthCard wide>
        <AuthPageHeader
          eyebrow="Manager"
          title="Add payment method"
          subtitle={`${selected.label} · ${MANAGER_SUBSCRIPTION_TRIAL_DAYS}-day free trial, then ${price.headline}${price.period ?? ""}`}
          accent={false}
        />
        <SubscriptionCheckoutHint className="mt-2 text-center text-xs leading-relaxed text-muted" />
        <div className="mt-4 rounded-2xl border border-border bg-card/50 p-3">
          <EmbeddedCheckoutMount clientSecret={checkoutClientSecret} onError={onEmbeddedError} />
        </div>
        <button
          type="button"
          className="auth-back-link mt-4 block w-full text-center text-[13px] font-semibold text-primary/90"
          onClick={() => setCheckoutClientSecret(null)}
        >
          ← Change plan
        </button>
      </AuthCard>
    );
  }

  const ctaLabel = pricingComplete
    ? "Open portal"
    : checkoutBusy || emailSignupBusy
      ? "Working…"
      : googleCheckoutBusy
        ? "Setting up…"
        : requiresPaymentSetup
          ? `Start ${MANAGER_SUBSCRIPTION_TRIAL_DAYS}-day trial · ${selected.label}`
          : "Continue";

  return (
    <AuthCard wide>
      <div className="auth-plan-picker auth-plan-picker-wide">
        <AuthPageHeader
          eyebrow="Manager"
          title="Create account"
          subtitle="Choose Free, Pro, or Business — first 2 weeks free with card or Apple Pay on paid plans"
          accent={false}
        />

        <div className="mt-4 sm:mt-5">
          <ManagerPlanBillingToggle billing={billing} onChange={setBilling} disabled={checkoutLocked} />
        </div>

        <div className="auth-plan-tier-grid mt-4 sm:mt-5">
          <ManagerPlanTierCards
            tiers={planTiers}
            billing={billing}
            selectedTierId={selectedTierId}
            onSelectTier={setSelectedTierId}
            disabled={checkoutLocked}
          />
        </div>

        {requiresPaymentSetup ? (
          <p className="auth-plan-price-block mt-4 text-center text-xs text-muted sm:mt-5">
            {MANAGER_SUBSCRIPTION_TRIAL_DAYS}-day free trial on {selected.label}
            {isPaidTier ? `, then ${price.headline}${price.period ?? ""}` : " — card required to start"}
          </p>
        ) : null}

        {stripeCheckoutBlocked && requiresPaymentSetup ? (
          <p className="auth-stripe-dev-notice mt-4 px-4 py-3">{stripeCheckoutBlocked}</p>
        ) : null}

        <div className="auth-plan-form-block mt-5 space-y-3 sm:mt-6">
        {sessionSignedIn && session?.email ? (
          <>
            <GoogleSignedInBanner
              email={session.email}
              fullName={session.fullName}
              provider={session.isGoogle === false ? "email" : "google"}
              subtitle={
                pricingComplete
                  ? "Your portal is ready."
                  : "Continue to secure checkout (card or Apple Pay)."
              }
            />
            <Button
              type="button"
              className="btn-cobalt w-full rounded-full py-2.5 text-[15px] font-semibold"
              disabled={checkoutLocked || Boolean(stripeCheckoutBlocked && requiresPaymentSetup)}
              onClick={() => {
                if (pricingComplete) {
                  router.push("/portal/dashboard");
                  return;
                }
                void continueSignedIn();
              }}
            >
              {ctaLabel}
            </Button>
          </>
        ) : (
          <>
            <PricingGoogleContinueButton
              tier={selectedTierId}
              billing={billing}
              disabled={checkoutLocked || sessionLoading || Boolean(stripeCheckoutBlocked && requiresPaymentSetup)}
              returnSurface="mobile-plan"
            />

            <AuthDivider label="or email" />

            <div className="space-y-2.5">
              <Input
                placeholder="Full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
                disabled={checkoutLocked}
              />
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                disabled={checkoutLocked}
              />
              <PasswordInput
                placeholder="Password (8+ characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                disabled={checkoutLocked}
              />
            </div>

            <Button
              type="button"
              className="btn-cobalt w-full rounded-full py-2.5 text-[15px] font-semibold"
              disabled={
                checkoutLocked || sessionLoading || Boolean(stripeCheckoutBlocked && requiresPaymentSetup)
              }
              onClick={() => void submitEmailSignup()}
            >
              {ctaLabel}
            </Button>
          </>
        )}
        </div>

        <AuthAccountFooterLink href="/auth/manager">Already have an account? Sign in</AuthAccountFooterLink>
        <AuthAccountFooterLink href="/auth/sign-in">Change role</AuthAccountFooterLink>
      </div>
    </AuthCard>
  );
}

export function ManagerPlanPicker() {
  return (
    <Suspense
      fallback={
        <AuthCard>
          <p className="text-center text-sm text-muted">Loading…</p>
        </AuthCard>
      }
    >
      <ManagerPlanPickerInner />
    </Suspense>
  );
}
