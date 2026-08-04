"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics/track-client";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { useIsNativeApp } from "@/hooks/use-is-native-app";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { MANAGER_PLAN_TIERS } from "@/data/manager-plan-tiers";
import { PRODUCTION_APP_ORIGIN } from "@/lib/app-url";
import { openAppUrl } from "@/lib/native/open-url";
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
 * Guideline 3.1.2 requires the purchase screen itself to carry the subscription
 * title, its length, the price per period, a plain auto-renew statement, and
 * working Terms of Use (EULA) + Privacy Policy links. Those links are BUTTONS
 * driving the in-app browser (`openAppUrl`), never `<a href>` anchors — the
 * 3.1.1 regression test forbids off-app hrefs on this surface, and a plain
 * anchor would bounce the manager out of the WebView and lose their session.
 *
 * Double-subscribe guard (report §3.4): if the account already has an active
 * Stripe (web) OR Apple subscription, we show a manage-only notice and never
 * offer a second purchase — the union entitlement already makes them paid.
 */

const TIER_LABEL: Record<ManagerSkuTier, string> = { free: "Free", pro: "Pro", business: "Business" };

export const NATIVE_PLAN_TERMS_URL = `${PRODUCTION_APP_ORIGIN}/tos`;
export const NATIVE_PLAN_PRIVACY_URL = `${PRODUCTION_APP_ORIGIN}/privacy`;

/** Feature copy comes from the shared tier catalog — never hand-written here. */
function tierBlurb(tier: ManagerSkuTier): string {
  return MANAGER_PLAN_TIERS.find((t) => t.id === tier)?.monthly.sub ?? "";
}

function CurrentPlanChip({ trial }: { trial?: boolean }) {
  return (
    <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
      {trial ? "Current · trial" : "Current plan"}
    </span>
  );
}

/**
 * Auto-renew statement + Terms of Use (EULA) + Privacy Policy — the 3.1.2 block.
 * Both links open in the in-app browser so the session in the WebView survives.
 */
function NativePlanLegalFooter() {
  return (
    <div className="space-y-2 px-1 text-center">
      <p className="text-xs leading-relaxed text-muted">
        Subscriptions renew automatically each month at the price shown until canceled. You can cancel anytime in your
        App Store account settings; cancel at least 24 hours before the current period ends to avoid the next charge.
        Payment is charged to your Apple Account.
      </p>
      <p className="text-xs text-muted">
        <button
          type="button"
          className="font-medium text-primary underline underline-offset-2"
          data-attr="ios-plan-terms-of-use"
          onClick={() => void openAppUrl(NATIVE_PLAN_TERMS_URL)}
        >
          Terms of Use (EULA)
        </button>
        <span aria-hidden> · </span>
        <button
          type="button"
          className="font-medium text-primary underline underline-offset-2"
          data-attr="ios-plan-privacy-policy"
          onClick={() => void openAppUrl(NATIVE_PLAN_PRIVACY_URL)}
        >
          Privacy Policy
        </button>
      </p>
    </div>
  );
}

type Props = {
  currentTier: ManagerSkuTier;
  subLoaded: boolean;
  stripeManaged: boolean;
  appleManaged: boolean;
  isFree: boolean;
  /** True while the account is on the no-card signup trial (`billing = 'trial'`). */
  trialActive?: boolean;
  onReload: () => void | Promise<void>;
};

export function ManagerPlanNative({
  currentTier,
  subLoaded,
  stripeManaged,
  appleManaged,
  isFree,
  trialActive = false,
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
  const [switchingToFree, setSwitchingToFree] = useState(false);
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
      if (purchasingProductId || restoring || switchingToFree) return;
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
    [purchasingProductId, restoring, switchingToFree, showToast, pollUntilPaid],
  );

  const onRestore = useCallback(async () => {
    if (purchasingProductId || restoring || switchingToFree) return;
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
  }, [purchasingProductId, restoring, switchingToFree, showToast, pollUntilPaid]);

  /**
   * Trial / comped accounts only (canOffer implies no Stripe and no Apple
   * subscription): committing to Free is a plain server-side plan change, not a
   * purchase or an Apple-subscription cancellation, so it is safe to offer here.
   */
  const onSwitchToFree = useCallback(async () => {
    if (purchasingProductId || restoring || switchingToFree) return;
    setSwitchingToFree(true);
    try {
      const res = await fetch("/api/stripe/subscription/update-tier", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: "free" }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        showToast(body.error ?? "Could not switch to Free.");
        return;
      }
      showToast("You're on the Free plan.");
      await onReload();
    } catch {
      showToast("Network error.");
    } finally {
      setSwitchingToFree(false);
    }
  }, [purchasingProductId, restoring, switchingToFree, showToast, onReload]);

  const busy = Boolean(purchasingProductId) || restoring || activating || switchingToFree;

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
      <div className="native-only mx-auto max-w-lg space-y-4">
        <div className="rounded-2xl border border-border surface-panel p-6 text-center">
          <p className="text-lg font-semibold text-foreground">You&apos;re on {TIER_LABEL[currentTier]}</p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Your subscription is billed through the App Store. To change your plan, or to downgrade or cancel, open the
            Settings app and go to Apple Account › Subscriptions — plan changes aren&apos;t made inside PropLane.
          </p>
        </div>
        <NativePlanLegalFooter />
      </div>
    );
  }

  if (stripeManaged) {
    // App Store 3.1.1: don't steer the user to an external site to manage/buy.
    // They already have an active plan, so there is simply nothing to purchase
    // here — no website named, no "manage on the web" instruction.
    return (
      <div className="native-only mx-auto max-w-lg rounded-2xl border border-border surface-panel p-6 text-center">
        <p className="text-lg font-semibold text-foreground">You&apos;re on {TIER_LABEL[currentTier]}</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Your plan is already active — there&apos;s nothing to purchase here.
        </p>
      </div>
    );
  }

  // Purchase surface (Free / trial / no active paid subscription).
  const proAndBusiness = offerings.filter((o) => o.tier === "pro" || o.tier === "business");

  return (
    <div className="native-only mx-auto max-w-lg space-y-4">
      <div className="text-center">
        <p className="text-lg font-semibold text-foreground">Choose your plan</p>
        <p className="mt-1 text-sm text-muted">
          {isFree
            ? "You're on the Free plan."
            : trialActive
              ? `You're on a free ${TIER_LABEL[currentTier]} trial.`
              : `You're on ${TIER_LABEL[currentTier]}.`}{" "}
          Paid plans are billed through the App Store.
        </p>
      </div>

      {/* Free tier — always shown so all three plans are visible and the current one is marked. */}
      <div
        className={`rounded-2xl border surface-panel p-5 ${isFree ? "border-2 border-primary" : "border-border"}`}
      >
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-base font-semibold text-foreground">PropLane Free</p>
          <p className="text-base font-semibold text-foreground">
            $0<span className="text-xs font-normal text-muted">/month</span>
          </p>
        </div>
        <p className="mt-1 text-sm leading-relaxed text-muted">{tierBlurb("free")}</p>
        <div className="mt-3">
          {isFree ? (
            <CurrentPlanChip />
          ) : (
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-full"
              disabled={busy}
              data-attr="ios-switch-to-free"
              onClick={() => onSwitchToFree()}
            >
              {switchingToFree ? "Switching…" : "Switch to Free"}
            </Button>
          )}
        </div>
        {!isFree ? (
          <p className="mt-2 text-xs leading-relaxed text-muted">
            {trialActive ? "Ends your trial now. " : ""}Your properties and records stay — Free includes 1 property
            listing and locks resident, lease, and inbox tools until you subscribe again. A dedicated phone number
            &amp; texting are available only with an actively paid plan.
          </p>
        ) : null}
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
          {proAndBusiness.map((offering) => {
            const isCurrent = offering.tier === currentTier;
            return (
              <div
                key={offering.productId}
                className={`rounded-2xl border surface-panel p-5 ${isCurrent ? "border-2 border-primary" : "border-border"}`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  {/* 3.1.2: subscription title + price per period on the purchase screen. */}
                  <p className="text-base font-semibold text-foreground">PropLane {TIER_LABEL[offering.tier]}</p>
                  <p className="text-base font-semibold text-foreground">
                    {offering.priceString}
                    <span className="text-xs font-normal text-muted">/month</span>
                  </p>
                </div>
                {/* 3.1.2: subscription length — a 1-month subscription that auto-renews. */}
                <p className="mt-0.5 text-xs font-medium text-muted">1-month subscription · renews monthly until canceled</p>
                {isCurrent ? (
                  <div className="mt-2">
                    <CurrentPlanChip trial={trialActive} />
                  </div>
                ) : null}
                <p className="mt-2 text-sm leading-relaxed text-muted">{tierBlurb(offering.tier)}</p>
                <Button
                  type="button"
                  variant="primary"
                  className="mt-4 w-full rounded-full"
                  disabled={busy}
                  data-attr={`ios-subscribe-${offering.tier}`}
                  onClick={() => onSubscribe(offering)}
                >
                  {purchasingProductId === offering.productId
                    ? "Opening App Store…"
                    : activating
                      ? "Activating…"
                      : `Subscribe to ${TIER_LABEL[offering.tier]}`}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <NativePlanLegalFooter />

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
