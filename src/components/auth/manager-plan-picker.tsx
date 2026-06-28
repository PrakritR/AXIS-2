"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { GoogleSignedInBanner } from "@/components/auth/google-signed-in-banner";
import { AuthBackLink, AuthPageHeader } from "@/components/auth/auth-mobile-primitives";
import { PricingGoogleContinueButton } from "@/components/auth/pricing-google-continue-button";
import { EmbeddedCheckoutMount } from "@/components/stripe/embedded-checkout";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { Button } from "@/components/ui/button";
import {
  buildPricingOffer,
  continuePartnerPricingWithOffer,
  fetchPartnerPricingSession,
  handleGoogleSignedInReturn,
  type PartnerPricingSession,
} from "@/lib/auth/partner-pricing-google-flow";
import {
  clearManagerPricingOffer,
  persistManagerPricingOffer,
  readManagerPricingOffer,
} from "@/lib/auth/manager-pricing-oauth-storage";
import { partnerPricingFinishPath } from "@/lib/auth/resume-partner-pricing-oauth";
import { MANAGER_PLAN_TIERS, type ManagerPlanTierDefinition, type PlanTierId } from "@/data/manager-plan-tiers";
import { loadManagerPlanTiers } from "@/lib/site-content";
import { isManagerOnboardTier, parseOnboardOfferSearchParams } from "@/lib/manager-onboard-links";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

function tierById(tiers: ManagerPlanTierDefinition[], id: PlanTierId) {
  return tiers.find((t) => t.id === id) ?? tiers[0]!;
}

function ManagerPlanPickerInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useAppUi();

  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [selectedTierId, setSelectedTierId] = useState<PlanTierId>("pro");
  const [planTiers, setPlanTiers] = useState(MANAGER_PLAN_TIERS);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutClientSecret, setCheckoutClientSecret] = useState<string | null>(null);
  const [googleCheckoutBusy, setGoogleCheckoutBusy] = useState(false);
  const [googleSession, setGoogleSession] = useState<PartnerPricingSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  const googleSignedIn = Boolean(googleSession?.authenticated && googleSession.isGoogle !== false);
  const pricingAccountComplete = googleSignedIn && googleSession != null && !googleSession.needsPricing;
  const checkoutLocked = checkoutBusy || googleCheckoutBusy || Boolean(checkoutClientSecret);

  const selected = useMemo(() => tierById(planTiers, selectedTierId), [planTiers, selectedTierId]);
  const price = billing === "monthly" ? selected.monthly : selected.annual;

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
    void fetchPartnerPricingSession().then((session) => {
      setGoogleSession(session);
      setSessionLoading(false);
    });
  }, []);

  useEffect(() => {
    persistManagerPricingOffer(buildPricingOffer({ tier: selectedTierId, billing }));
  }, [selectedTierId, billing]);

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

        const session = await fetchPartnerPricingSession();
        if (cancelled) return;
        setGoogleSession(session);

        if (result.status !== "provisioned") {
          if (result.status === "error") showToast(result.message);
          return;
        }

        const offer = stored ?? buildPricingOffer({ tier: selectedTierId, billing });
        const paidResult = await continuePartnerPricingWithOffer(offer);
        if (cancelled) return;

        if (paidResult.status === "checkout") {
          setCheckoutClientSecret(paidResult.clientSecret);
          return;
        }
        if (paidResult.status === "portal") {
          router.replace("/portal/dashboard");
          return;
        }
        if (paidResult.status === "error") showToast(paidResult.message);
      } finally {
        if (!cancelled) setGoogleCheckoutBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [billing, router, searchParams, selectedTierId, showToast]);

  useEffect(() => {
    const sid = searchParams.get("session_id");
    if (!sid) return;
    clearManagerPricingOffer();
    router.replace(`/auth/manager-id?session_id=${encodeURIComponent(sid)}`);
  }, [router, searchParams]);

  const continueSignedInPricing = useCallback(async () => {
    setCheckoutBusy(true);
    try {
      const offer = buildPricingOffer({ tier: selectedTierId, billing });
      const result = await continuePartnerPricingWithOffer(offer);
      if (result.status === "checkout") {
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
    } finally {
      setCheckoutBusy(false);
    }
  }, [billing, router, selectedTierId, showToast]);

  return (
    <AuthCard>
      <AuthPageHeader eyebrow="Manager" title="Choose plan" accent={false} />

      <div className="mt-5 flex flex-wrap gap-2">
        {planTiers.map((t) => {
          const active = selectedTierId === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedTierId(t.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                active ? "btn-cobalt shadow-sm" : "border border-border bg-card/60 text-muted"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="mt-3 inline-flex rounded-full border border-border bg-card/40 p-1">
        {(["monthly", "annual"] as const).map((cycle) => (
          <button
            key={cycle}
            type="button"
            onClick={() => setBilling(cycle)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${
              billing === cycle ? "btn-cobalt" : "text-muted"
            }`}
          >
            {cycle}
          </button>
        ))}
      </div>

      <p className="mt-4 text-center">
        <span className="text-2xl font-bold tracking-tight text-foreground">{price.headline}</span>
        {price.period ? <span className="text-sm font-medium text-muted">{price.period}</span> : null}
      </p>

      <div className="mt-5 space-y-3">
        {googleSignedIn && googleSession?.email ? (
          <>
            <GoogleSignedInBanner
              email={googleSession.email}
              fullName={googleSession.fullName}
              subtitle={pricingAccountComplete ? "Open your portal or change plan below." : "Continue to finish setup."}
            />
            <Button
              type="button"
              className="btn-cobalt w-full rounded-full py-2.5 text-[15px] font-semibold"
              disabled={checkoutLocked}
              onClick={() => {
                if (pricingAccountComplete) {
                  router.push("/portal/dashboard");
                  return;
                }
                void continueSignedInPricing();
              }}
            >
              {pricingAccountComplete ? "Open portal" : checkoutBusy ? "Working…" : "Continue"}
            </Button>
          </>
        ) : (
          <>
            <PricingGoogleContinueButton tier={selectedTierId} billing={billing} disabled={checkoutLocked || sessionLoading} />
            <p className="text-center text-[11px] text-muted">
              {googleCheckoutBusy ? "Setting up…" : "Sign in with Google to create your account"}
            </p>
          </>
        )}
      </div>

      {checkoutClientSecret ? (
        <div className="mt-5 rounded-2xl border border-border bg-card/50 p-3">
          <EmbeddedCheckoutMount clientSecret={checkoutClientSecret} onError={onEmbeddedError} />
        </div>
      ) : null}

      <p className="auth-footer-link mt-5 text-center text-[13px] text-muted">
        <Link className="font-semibold text-primary hover:opacity-90" href="/auth/manager">
          ← Back
        </Link>
      </p>
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
