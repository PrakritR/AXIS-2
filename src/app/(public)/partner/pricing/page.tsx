"use client";

import { useIsNativeApp } from "@/hooks/use-is-native-app";
import { persistManagerPricingOffer } from "@/lib/auth/manager-pricing-oauth-storage";
import { MANAGER_PLAN_TIERS, isPlanTierId, type ManagerPlanTierDefinition, type PlanTierId } from "@/data/manager-plan-tiers";
import { loadManagerPlanTiers } from "@/lib/site-content";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

/**
 * Marketing pricing: informs and LEADS TO the single portal. Plan selection is part of
 * manager onboarding AFTER sign-up (/auth/manager/plan) — never a gate that must be
 * cleared before an account can exist. The selected tier is remembered so the plan step
 * can preselect it.
 */
export default function PartnerPricingPage() {
  const router = useRouter();
  const { isNative } = useIsNativeApp();

  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [planTiers, setPlanTiers] = useState<ManagerPlanTierDefinition[]>(MANAGER_PLAN_TIERS);

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
    // Honor a ?tier= / ?billing= deep link (e.g. from an ad) as the initial billing view.
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const b = params.get("billing");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from the URL after mount
    if (b === "monthly" || b === "annual") setBilling(b);
  }, []);

  const getStarted = useCallback(
    (tier: PlanTierId) => {
      // Remember the choice, then ONE clean redirect to the universal create-account hub with
      // the plan preselected. The hub reveals the payment step for paid tiers on Continue;
      // Free continues straight to the portal.
      persistManagerPricingOffer({ tier, billing });
      const params = new URLSearchParams({ mode: "create", role: "manager", tier, billing });
      router.push(`/auth/create-account?${params.toString()}`);
    },
    [billing, router],
  );

  if (isNative) return null;

  return (
    <div className="min-h-screen px-4 py-14 sm:px-5 sm:py-20">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-4xl font-bold tracking-[-0.03em] text-foreground sm:text-5xl md:text-[3.25rem]">Start with Axis.</h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted">
          Create your account in seconds, then choose Free, Pro, or Business during setup. Free starts right away; Pro
          and Business add a card during onboarding — no plan required before your account exists.
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
          const cta = t.id === "free" ? "Get started free" : `Choose ${t.label}`;
          const cardInner = (
            <>
              <div className="min-h-[28px]">
                {isProFeatured ? (
                  <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                    Popular
                  </span>
                ) : (
                  <span className="inline-flex rounded-full bg-accent/80 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
                    {t.label}
                  </span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-baseline gap-x-1 gap-y-0">
                <span className="text-4xl font-black tracking-tight text-foreground sm:text-5xl">{pb.headline}</span>
                {pb.period ? <span className="text-sm font-medium text-muted">{pb.period}</span> : null}
              </div>

              <p className="mt-2 min-h-[4.5rem] text-sm leading-snug text-muted">{pb.sub}</p>

              <button
                type="button"
                onClick={() => getStarted(isPlanTierId(t.id) ? t.id : "free")}
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
            <div key={t.id} className="flex flex-col glass-card rounded-3xl p-7">
              {cardInner}
            </div>
          );
        })}
      </div>

      <p className="mx-auto mt-10 max-w-5xl text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/auth/sign-in" className="font-semibold text-primary hover:underline">
          Sign in
        </Link>
      </p>
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
