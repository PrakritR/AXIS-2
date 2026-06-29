"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { GoogleSignedInBanner } from "@/components/auth/google-signed-in-banner";
import { AuthDivider, AuthPageHeader } from "@/components/auth/auth-mobile-primitives";
import { PricingGoogleContinueButton } from "@/components/auth/pricing-google-continue-button";
import { EmbeddedCheckoutMount } from "@/components/stripe/embedded-checkout";
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
import { MANAGER_PLAN_TIERS, type ManagerPlanTierDefinition, type PlanTierId } from "@/data/manager-plan-tiers";
import { loadManagerPlanTiers } from "@/lib/site-content";
import { isManagerOnboardTier, parseOnboardOfferSearchParams } from "@/lib/manager-onboard-links";
import { MANAGER_SUBSCRIPTION_TRIAL_DAYS } from "@/lib/stripe/subscription-checkout-session";
import { stripeLiveJsBlockedMessage } from "@/lib/stripe/stripe-js-client";
import Link from "next/link";
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
    if (tier && isManagerOnboardTier(tier)) setSelectedTierId(tier);
    const offer = parseOnboardOfferSearchParams(searchParams);
    if (offer.billing) setBilling(offer.billing);
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
        router.push("/portal/dashboard");
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
      const body = (await res.json()) as { error?: string };
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
      <AuthCard>
        <AuthPageHeader
          eyebrow="Manager"
          title="Add payment method"
          subtitle={`${selected.label} · ${MANAGER_SUBSCRIPTION_TRIAL_DAYS}-day free trial, then ${price.headline}${price.period ?? ""}`}
          accent={false}
        />
        <p className="mt-2 text-center text-xs leading-relaxed text-muted">
          Secure checkout with card or Apple Pay. You won&apos;t be charged until your trial ends.
        </p>
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
    <AuthCard>
      <div className="auth-plan-picker">
      <AuthPageHeader
        eyebrow="Manager"
        title="Choose plan"
        subtitle={
          sessionSignedIn
            ? "Add a card or Apple Pay to start your free trial"
            : "Pick a plan — first 2 weeks free with card or Apple Pay"
        }
        accent={false}
      />

      <div className="auth-plan-tier-row mt-5 flex flex-wrap justify-center gap-2">
        {planTiers.map((t) => {
          const active = selectedTierId === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedTierId(t.id)}
              disabled={checkoutLocked}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                active ? "btn-cobalt shadow-sm" : "border border-border bg-card/60 text-muted"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {isPaidTier ? (
        <div className="mt-3 flex justify-center">
          <div className="inline-flex rounded-full border border-border bg-card/40 p-1">
            {(["monthly", "annual"] as const).map((cycle) => (
              <button
                key={cycle}
                type="button"
                onClick={() => setBilling(cycle)}
                disabled={checkoutLocked}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${
                  billing === cycle ? "btn-cobalt" : "text-muted"
                }`}
              >
                {cycle}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <p className="auth-plan-price-block mt-4 text-center">
        <span className="text-2xl font-bold tracking-tight text-foreground">{price.headline}</span>
        {price.period ? <span className="text-sm font-medium text-muted">{price.period}</span> : null}
      </p>
      {requiresPaymentSetup ? (
        <p className="mt-1.5 text-center text-xs text-muted">
          {MANAGER_SUBSCRIPTION_TRIAL_DAYS}-day free trial
          {isPaidTier ? `, then ${price.headline}${price.period ?? ""}` : " on Free — card required"}
        </p>
      ) : null}

      {stripeCheckoutBlocked && requiresPaymentSetup ? (
        <p className="auth-stripe-dev-notice mt-4 px-4 py-3">
          {stripeCheckoutBlocked}
        </p>
      ) : null}

      <div className="auth-plan-form-block mt-5 space-y-3">
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

      <p className="auth-footer-link mt-5 text-center text-[13px] text-muted">
        <Link className="font-semibold text-primary hover:opacity-90" href="/auth/manager">
          ← Back to sign in
        </Link>
      </p>
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
