"use client";

import { ManagerSignupPanel } from "@/components/auth/manager-signup-panel";
import { useIsNativeApp } from "@/hooks/use-is-native-app";
import { persistManagerPricingOffer, readManagerPricingOffer } from "@/lib/auth/manager-pricing-oauth-storage";
import { MANAGER_PLAN_TIERS, isPlanTierId, type ManagerPlanTierDefinition, type PlanTierId } from "@/data/manager-plan-tiers";
import { loadManagerPlanTiers } from "@/lib/site-content";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Pricing with FULLY INTEGRATED signup: the plan cards select a plan, and the
 * "Get started" section directly below them creates the account (Google or manual
 * details) and continues straight into payment — all on this one page. This is the
 * only manager signup surface on the web; /auth/create-account redirects here.
 * Google OAuth for a paid plan returns here (?google_signed_in=1) and resumes the
 * stored offer in the same section. Sign-in is its own page, linked below.
 */
export default function PartnerPricingPage() {
  const router = useRouter();
  const { isNative } = useIsNativeApp();

  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [planTiers, setPlanTiers] = useState<ManagerPlanTierDefinition[]>(MANAGER_PLAN_TIERS);
  const [selectedTier, setSelectedTier] = useState<PlanTierId>("free");
  const [googleReturn, setGoogleReturn] = useState(false);
  const signupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isNative !== true) return;
    router.replace("/auth/manager/plan");
  }, [isNative, router]);

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
    // Honor ?tier= / ?billing= deep links (e.g. from an ad), and resume a Google OAuth
    // return (?google_signed_in=1) with the stored plan selection.
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const b = params.get("billing");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from the URL after mount
    if (b === "monthly" || b === "annual") setBilling(b);
    const t = params.get("tier");
    if (t && isPlanTierId(t)) setSelectedTier(t);

    if (params.get("google_signed_in") === "1" || params.get("google_checkout") === "1") {
      const stored = readManagerPricingOffer();
      // Free-tier Google returns go straight to the portal from the OAuth callback; landing
      // here means a paid offer (or a lost one — fall back to Free, which is always safe).
      setSelectedTier(stored?.tier ?? "free");
      if (stored) setBilling(stored.billing);
      setGoogleReturn(true);
      window.setTimeout(() => signupRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
    }
  }, []);

  const choosePlan = useCallback(
    (tier: PlanTierId) => {
      // Remember the choice (survives the Google OAuth round trip), update the integrated
      // signup section below, and bring it into view — the user never leaves this page.
      persistManagerPricingOffer({ tier, billing, returnSurface: "partner-pricing" });
      setSelectedTier(tier);
      signupRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [billing],
  );

  if (isNative) return null;

  const selectedTierDef = planTiers.find((t) => t.id === selectedTier) ?? planTiers[0]!;

  return (
    <div className="min-h-screen px-4 py-14 sm:px-5 sm:py-20">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-4xl font-bold tracking-[-0.03em] text-foreground sm:text-5xl md:text-[3.25rem]">Start with Axis.</h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted">
          Pick a plan, then create your account right below. Free starts immediately; Pro and Business continue to
          payment in the same step, with a free trial before you&apos;re charged.
        </p>

        <div className="glass-card mt-8 inline-flex items-center gap-1 rounded-full p-1">
          <button
            type="button"
            onClick={() => setBilling("monthly")}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition-all duration-150 ${
              billing === "monthly" ? "btn-cobalt shadow-sm" : "text-muted hover:text-foreground"
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setBilling("annual")}
            className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-all duration-150 ${
              billing === "annual" ? "btn-cobalt shadow-sm" : "text-muted hover:text-foreground"
            }`}
          >
            Annual
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                billing === "annual" ? "bg-card/20 text-white" : "bg-[var(--status-confirmed-bg)] text-[var(--status-confirmed-fg)]"
              }`}
            >
              20% off
            </span>
          </button>
        </div>
      </div>

      <div className="mx-auto mt-10 grid max-w-5xl gap-5 lg:grid-cols-3 lg:items-stretch">
        {planTiers.map((t) => {
          const pb = billing === "monthly" ? t.monthly : t.annual;
          const isProFeatured = t.id === "pro";
          const isSelected = t.id === selectedTier;
          const cta = t.id === "free" ? "Get started free" : `Choose ${t.label}`;
          const cardInner = (
            <>
              <div className="flex min-h-[28px] items-start justify-between gap-2">
                {isProFeatured ? (
                  <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                    Popular
                  </span>
                ) : (
                  <span className="inline-flex rounded-full bg-accent/80 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
                    {t.label}
                  </span>
                )}
                {isSelected ? (
                  <span className="inline-flex rounded-full bg-[var(--status-confirmed-bg)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--status-confirmed-fg)]">
                    Selected
                  </span>
                ) : null}
              </div>

              <div className="mt-3 flex flex-wrap items-baseline gap-x-1 gap-y-0">
                <span className="text-4xl font-black tracking-tight text-foreground sm:text-5xl">{pb.headline}</span>
                {pb.period ? <span className="text-sm font-medium text-muted">{pb.period}</span> : null}
              </div>

              <p className="mt-2 min-h-[4.5rem] text-sm leading-snug text-muted">{pb.sub}</p>

              <button
                type="button"
                onClick={() => choosePlan(isPlanTierId(t.id) ? t.id : "free")}
                data-attr={`pricing-choose-${t.id}`}
                className={`mt-5 min-h-[52px] w-full rounded-2xl py-3 text-sm font-semibold transition-all duration-150 active:scale-[0.98] ${
                  isProFeatured ? "btn-cobalt" : "btn-metallic text-foreground"
                }`}
              >
                {cta}
              </button>

              <ul className="mt-5 space-y-2.5 border-t border-border/60 pt-5">
                {t.features.map((f) => (
                  <li key={f.text} className="flex items-start gap-2.5 text-sm">
                    <span className={`mt-0.5 shrink-0 ${f.included ? "text-primary" : "text-muted/40"}`} aria-hidden>
                      <CheckIcon />
                    </span>
                    <span className={f.included ? "text-foreground" : "text-muted/60"}>{f.text}</span>
                  </li>
                ))}
              </ul>
            </>
          );

          if (isProFeatured) {
            return (
              <div
                key={t.id}
                className="rounded-3xl p-[2px]"
                style={{ background: "linear-gradient(135deg, var(--primary) 0%, var(--sky) 50%, var(--steel-light) 100%)" }}
              >
                <div className="flex h-full flex-col rounded-[calc(1.5rem-2px)] glass-card p-7">{cardInner}</div>
              </div>
            );
          }

          return (
            <div
              key={t.id}
              className={`flex flex-col glass-card rounded-3xl p-7 ${isSelected ? "ring-2 ring-primary/50" : ""}`}
            >
              {cardInner}
            </div>
          );
        })}
      </div>

      <div ref={signupRef} className="mx-auto mt-12 max-w-md scroll-mt-24" id="get-started">
        <div className="glass-card rounded-3xl p-7">
          <h2 className="text-center text-sm font-bold uppercase tracking-[0.12em] text-primary">
            Get started — {selectedTierDef.label}
          </h2>
          <div className="mt-4">
            <ManagerSignupPanel
              tier={selectedTier}
              billing={billing}
              planTiers={planTiers}
              returnSurface="partner-pricing"
              googleReturn={googleReturn}
            />
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href="/auth/sign-in" className="font-semibold text-primary hover:underline" data-attr="pricing-sign-in-link">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
