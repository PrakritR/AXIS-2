"use client";

import Link from "next/link";
import { useState } from "react";
import { ManagerPlanBillingToggle, ManagerPlanTierCards } from "@/components/auth/manager-plan-tier-cards";
import { MANAGER_PLAN_TIERS, type PlanTierId } from "@/data/manager-plan-tiers";
import { RevealOnView } from "@/components/motion/reveal-on-view";

export function ManagerPricingPreview() {
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [selectedTierId, setSelectedTierId] = useState<PlanTierId>("pro");

  return (
    <section className="mx-auto max-w-4xl px-4 pb-16 sm:px-6 sm:pb-20">
      <RevealOnView>
        <div className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">Simple pricing</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-foreground sm:text-3xl">
            Run your portfolio in Axis
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted">
            Free to list your first property. Upgrade any time for residents, leases, and services.
          </p>
        </div>
      </RevealOnView>

      <RevealOnView delayMs={80}>
        <div className="mt-8">
          <ManagerPlanBillingToggle billing={billing} onChange={setBilling} />
        </div>
        <div className="mt-5">
          <ManagerPlanTierCards
            tiers={MANAGER_PLAN_TIERS}
            billing={billing}
            selectedTierId={selectedTierId}
            onSelectTier={setSelectedTierId}
            compact
          />
        </div>
        <div className="mt-8 text-center">
          <Link
            href={`/partner/pricing?tier=${selectedTierId}&billing=${billing}`}
            data-attr="manager-pricing-preview-cta"
            className="btn-cobalt inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center rounded-full px-8 py-3 text-sm font-semibold transition-[transform,filter] duration-200 hover:-translate-y-0.5 hover:brightness-105 active:scale-[0.98] sm:w-auto"
          >
            Choose a plan &amp; get started
          </Link>
        </div>
      </RevealOnView>
    </section>
  );
}
