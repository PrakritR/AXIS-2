"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { OnboardQrCode } from "@/components/portal/onboard-qr-code";
import { PORTAL_PAGE_TITLE, PORTAL_SECTION_SURFACE } from "@/components/portal/portal-metrics";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { resolveShareableAppOrigin } from "@/lib/app-url";
import {
  MANAGER_ONBOARD_TIERS,
  buildManagerOnboardPath,
  buildManagerOnboardUrl,
  type OnboardLinkOffer,
} from "@/lib/manager-onboard-links";
import { Input, Select } from "@/components/ui/input";

type TierOfferState = {
  pricingMode: "standard" | "free" | "discount";
  discountPercent: string;
  billing: "" | "monthly" | "annual";
};

const DEFAULT_OFFER: TierOfferState = {
  pricingMode: "standard",
  discountPercent: "20",
  billing: "",
};

function offerFromState(state: TierOfferState): OnboardLinkOffer | undefined {
  const offer: OnboardLinkOffer = {};
  if (state.billing) offer.billing = state.billing;

  if (state.pricingMode === "free") {
    offer.discountPercent = 100;
    return offer;
  }

  if (state.pricingMode === "discount") {
    const n = Number.parseInt(state.discountPercent, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 99) {
      offer.discountPercent = n;
      return offer;
    }
  }

  return state.billing ? offer : undefined;
}

function offerLabel(state: TierOfferState): string | null {
  if (state.pricingMode === "free") return "Free signup (no Stripe)";
  if (state.pricingMode === "discount") {
    const n = Number.parseInt(state.discountPercent, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 99) return `${n}% off first payment`;
  }
  return null;
}

export function AdminOnboardClient() {
  const { showToast } = useAppUi();
  const [origin, setOrigin] = useState("");
  const [offerByTier, setOfferByTier] = useState<Record<string, TierOfferState>>({});

  useEffect(() => {
    setOrigin(resolveShareableAppOrigin(window.location.origin));
  }, []);

  const tiers = useMemo(
    () =>
      MANAGER_ONBOARD_TIERS.map((tier) => {
        const state = offerByTier[tier.id] ?? DEFAULT_OFFER;
        const offer = offerFromState(state);
        return {
          ...tier,
          state,
          offer,
          offerNote: offerLabel(state),
          path: buildManagerOnboardPath(tier.id, offer),
          url: origin ? buildManagerOnboardUrl(origin, tier.id, offer) : "",
        };
      }),
    [origin, offerByTier],
  );

  const updateTierOffer = useCallback((tierId: string, patch: Partial<TierOfferState>) => {
    setOfferByTier((prev) => ({
      ...prev,
      [tierId]: { ...(prev[tierId] ?? DEFAULT_OFFER), ...patch },
    }));
  }, []);

  const copyLink = useCallback(
    async (url: string, label: string) => {
      if (!url) {
        showToast("Link not ready yet — try again in a moment.");
        return;
      }
      try {
        await navigator.clipboard.writeText(url);
        showToast(`${label} onboarding link copied.`);
      } catch {
        showToast("Could not copy link.");
      }
    },
    [showToast],
  );

  return (
    <div className={PORTAL_SECTION_SURFACE}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className={PORTAL_PAGE_TITLE}>Onboard</h1>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Share these links or QR codes so property managers can sign up on Free, Pro, or Business. Set pricing per
        tier — free signup or a percentage discount is applied automatically in Stripe checkout.
      </p>
      {origin.includes("vercel.app") ? (
        <p className="mt-3 max-w-2xl rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Links use your Vercel deployment URL. Set <code className="font-mono text-xs">NEXT_PUBLIC_CANONICAL_APP_URL</code>{" "}
          in production to your custom domain (for example <code className="font-mono text-xs">https://yourdomain.com</code>
          ).
        </p>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {tiers.map((tier) => (
          <article
            key={tier.id}
            className="glass-card flex flex-col rounded-2xl border border-border p-5 sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Manager plan</p>
                <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-foreground">{tier.label}</h2>
              </div>
              {tier.noCard ? (
                <span className="rounded-full bg-[var(--status-confirmed-bg)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--status-confirmed-fg)]">
                  No card
                </span>
              ) : null}
            </div>
            <p className="mt-3 text-sm leading-6 text-muted">{tier.description}</p>

            {!tier.noCard ? (
              <div className="mt-5 space-y-3 rounded-xl border border-border/70 bg-background/40 p-4">
                <p className="text-xs font-semibold text-foreground">Link pricing</p>
                <div>
                  <label className="text-xs font-medium text-muted" htmlFor={`${tier.id}-pricing`}>
                    Pricing mode
                  </label>
                  <Select
                    id={`${tier.id}-pricing`}
                    className="mt-1.5"
                    value={tier.state.pricingMode}
                    onChange={(e) =>
                      updateTierOffer(tier.id, {
                        pricingMode: e.target.value as TierOfferState["pricingMode"],
                      })
                    }
                  >
                    <option value="standard">Standard list price</option>
                    <option value="discount">Discount % (Stripe)</option>
                    <option value="free">Free signup (skip Stripe)</option>
                  </Select>
                </div>

                {tier.state.pricingMode === "discount" ? (
                  <div>
                    <label className="text-xs font-medium text-muted" htmlFor={`${tier.id}-discount`}>
                      Discount on first payment
                    </label>
                    <Input
                      id={`${tier.id}-discount`}
                      className="mt-1.5"
                      type="number"
                      min={1}
                      max={99}
                      value={tier.state.discountPercent}
                      onChange={(e) => updateTierOffer(tier.id, { discountPercent: e.target.value })}
                    />
                  </div>
                ) : null}

                <div>
                  <label className="text-xs font-medium text-muted" htmlFor={`${tier.id}-billing`}>
                    Default billing
                  </label>
                  <Select
                    id={`${tier.id}-billing`}
                    className="mt-1.5"
                    value={tier.state.billing}
                    onChange={(e) =>
                      updateTierOffer(tier.id, {
                        billing: e.target.value as TierOfferState["billing"],
                      })
                    }
                  >
                    <option value="">Let manager choose</option>
                    <option value="monthly">Monthly</option>
                    <option value="annual">Annual (20% off)</option>
                  </Select>
                </div>

                {tier.offerNote ? (
                  <p className="text-xs font-medium text-[var(--status-confirmed-fg)]">{tier.offerNote}</p>
                ) : null}
              </div>
            ) : null}

            <div className="mt-6 flex justify-center">
              {tier.url ? <OnboardQrCode url={tier.url} label={tier.label} /> : null}
            </div>

            <div className="mt-5 space-y-2">
              <p className="text-xs font-semibold text-muted">Onboarding link</p>
              <p className="break-all rounded-xl border border-border/70 bg-background/60 px-3 py-2 font-mono text-xs text-foreground">
                {tier.url || tier.path}
              </p>
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                className="btn-metallic rounded-full px-4 py-2 text-sm font-semibold text-foreground"
                onClick={() => void copyLink(tier.url, tier.label)}
              >
                Copy link
              </button>
              <Link
                href={tier.path}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-cobalt inline-flex items-center justify-center rounded-full px-4 py-2 text-center text-sm font-semibold"
              >
                Open sign-up
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
