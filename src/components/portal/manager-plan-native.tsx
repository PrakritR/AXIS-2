"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics/track-client";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { useIsNativeApp } from "@/hooks/use-is-native-app";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import {
  configureRevenueCat,
  getManagerOfferings,
  purchaseManagerPackage,
  restoreManagerPurchases,
  type ManagerOffering,
} from "@/lib/native/revenuecat-client";
import type { ManagerSkuTier } from "@/lib/manager-access";

/**
 * Native (iOS) In-App Purchase surface — replaces the old "managed outside the
 * app" notice so the manager subscription is purchasable via StoreKit, the fix
 * for the App Store 3.1.1 rejection. Renders ONLY inside the iOS shell (the
 * parent wraps it in `.native-only`; this also self-guards on `isNative`). The
 * web `.native-hide` plan UI is untouched.
 *
 * Double-subscribe guard (report §3.4): if the account already has an active
 * Stripe (web) OR Apple subscription, we show a manage-only notice and never
 * offer a second purchase — the union entitlement already makes them paid.
 */

const TIER_LABEL: Record<ManagerSkuTier, string> = { free: "Free", pro: "Pro", business: "Business" };

const TIER_BLURB: Record<"pro" | "business", string> = {
  pro: "Residents, leases, documents, finances, services, and inbox. Up to 2 properties.",
  business: "Everything in Pro at portfolio scale — up to 20 properties and 20 co-managers.",
};

type Props = {
  currentTier: ManagerSkuTier;
  subLoaded: boolean;
  stripeManaged: boolean;
  appleManaged: boolean;
  isFree: boolean;
  onReload: () => void | Promise<void>;
};

export function ManagerPlanNative({
  currentTier,
  subLoaded,
  stripeManaged,
  appleManaged,
  isFree,
  onReload,
}: Props) {
  const { isNative, platform } = useIsNativeApp();
  const isIos = isNative === true && platform === "ios";
  const { userId } = useManagerUserId();
  const { showToast } = useAppUi();

  const [offerings, setOfferings] = useState<ManagerOffering[]>([]);
  const [loadingOfferings, setLoadingOfferings] = useState(false);
  const [purchasingProductId, setPurchasingProductId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [activating, setActivating] = useState(false);
  const offeringsLoadedRef = useRef(false);

  const canOffer = isIos && subLoaded && !stripeManaged && !appleManaged;

  useEffect(() => {
    if (!canOffer || !userId || offeringsLoadedRef.current) return;
    offeringsLoadedRef.current = true;
    let cancelled = false;
    setLoadingOfferings(true);
    void (async () => {
      await configureRevenueCat(userId);
      const list = await getManagerOfferings();
      if (!cancelled) {
        setOfferings(list);
        setLoadingOfferings(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canOffer, userId]);

  /** Poll the subscription route until the webhook-granted tier lands (or we give up). */
  const pollUntilPaid = useCallback(async () => {
    setActivating(true);
    try {
      for (let i = 0; i < 8; i++) {
        await onReload();
        await new Promise((r) => setTimeout(r, 1500));
      }
    } finally {
      setActivating(false);
    }
  }, [onReload]);

  const onSubscribe = useCallback(
    async (offering: ManagerOffering) => {
      if (purchasingProductId || restoring) return;
      track("subscription_checkout_started", { tier: offering.tier, billing: "monthly", platform: "ios" });
      setPurchasingProductId(offering.productId);
      try {
        const outcome = await purchaseManagerPackage(offering.pkg);
        if (outcome.status === "cancelled") return;
        if (outcome.status === "error") {
          showToast(outcome.message);
          return;
        }
        showToast("Payment received. Activating your plan…");
        await pollUntilPaid();
      } finally {
        setPurchasingProductId(null);
      }
    },
    [purchasingProductId, restoring, showToast, pollUntilPaid],
  );

  const onRestore = useCallback(async () => {
    if (purchasingProductId || restoring) return;
    setRestoring(true);
    try {
      const { ok, hasActiveEntitlement } = await restoreManagerPurchases();
      if (!ok) {
        showToast("Could not restore purchases.");
        return;
      }
      if (!hasActiveEntitlement) {
        showToast("No previous purchases to restore.");
        return;
      }
      showToast("Restoring your plan…");
      await pollUntilPaid();
    } finally {
      setRestoring(false);
    }
  }, [purchasingProductId, restoring, showToast, pollUntilPaid]);

  const busy = Boolean(purchasingProductId) || restoring || activating;

  // Until the subscription payload lands we don't know whether this account is
  // already paid — never show Subscribe buttons on that guess.
  if (!subLoaded) {
    return (
      <div className="native-only mx-auto max-w-lg rounded-2xl border border-border surface-panel p-6 text-center">
        <p className="text-sm text-muted">Loading your plan…</p>
      </div>
    );
  }

  // Manage-only branches: already paid on one of the two stores.
  if (appleManaged) {
    return (
      <div className="native-only mx-auto max-w-lg rounded-2xl border border-border surface-panel p-6 text-center">
        <p className="text-lg font-semibold text-foreground">You&apos;re on {TIER_LABEL[currentTier]}</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Your subscription is billed through the App Store. Manage or cancel it in the Settings app under Apple Account
          › Subscriptions.
        </p>
      </div>
    );
  }

  if (stripeManaged) {
    return (
      <div className="native-only mx-auto max-w-lg rounded-2xl border border-border surface-panel p-6 text-center">
        <p className="text-lg font-semibold text-foreground">You&apos;re on {TIER_LABEL[currentTier]}</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Your subscription is billed on the web. Manage your plan at prop-lane.space — no need to buy again here.
        </p>
      </div>
    );
  }

  // Purchase surface (Free / no active paid subscription).
  const proAndBusiness = offerings.filter((o) => o.tier === "pro" || o.tier === "business");

  return (
    <div className="native-only mx-auto max-w-lg space-y-4">
      <div className="text-center">
        <p className="text-lg font-semibold text-foreground">Choose your plan</p>
        <p className="mt-1 text-sm text-muted">
          {isFree ? "You're on the Free plan." : "Upgrade to unlock the full portal."} Billed through the App Store;
          cancel anytime in Settings.
        </p>
      </div>

      {loadingOfferings ? (
        <p className="text-center text-sm text-muted">Loading plans…</p>
      ) : proAndBusiness.length === 0 ? (
        <div className="rounded-2xl border border-border surface-panel p-6 text-center">
          <p className="text-sm leading-relaxed text-muted">
            Plans aren&apos;t available to purchase right now. If you subscribed on another device, restore it below.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {proAndBusiness.map((offering) => (
            <div
              key={offering.productId}
              className="rounded-2xl border border-border surface-panel p-5"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-base font-semibold text-foreground">{TIER_LABEL[offering.tier]}</p>
                <p className="text-base font-semibold text-foreground">
                  {offering.priceString}
                  <span className="text-xs font-normal text-muted">/mo</span>
                </p>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-muted">{TIER_BLURB[offering.tier]}</p>
              <Button
                type="button"
                variant="primary"
                className="mt-4 w-full rounded-full"
                disabled={busy}
                data-attr={`ios-subscribe-${offering.tier}`}
                onClick={() => void onSubscribe(offering)}
              >
                {purchasingProductId === offering.productId
                  ? "Opening App Store…"
                  : activating
                    ? "Activating…"
                    : `Subscribe to ${TIER_LABEL[offering.tier]}`}
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="text-center">
        <button
          type="button"
          className="text-sm font-medium text-primary underline-offset-2 hover:underline disabled:opacity-60"
          disabled={busy}
          data-attr="ios-restore-purchases"
          onClick={() => void onRestore()}
        >
          {restoring ? "Restoring…" : "Restore purchases"}
        </button>
      </div>
    </div>
  );
}
