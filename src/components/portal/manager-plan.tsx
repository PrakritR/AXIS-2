"use client";

import { usePathname, useRouter } from "next/navigation";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { MANAGER_PLAN_TIERS } from "@/data/manager-plan-tiers";
import { normalizeManagerSkuTier, type ManagerSkuTier } from "@/lib/manager-access";
import { useAppUi } from "@/components/providers/app-ui-provider";

type SubPayload = {
  tier: string | null;
  /** `monthly` | `annual` when Stripe-managed; may be legacy values otherwise. */
  billing: string | null;
  isPro: boolean;
  isBusiness: boolean;
  isFree: boolean;
  isLegacyUnlimited: boolean;
  stripeManaged?: boolean;
  cancelAtPeriodEnd?: boolean;
  /** Unix seconds from Stripe.Subscription.current_period_end */
  currentPeriodEnd?: number | null;
  scheduledDowngrade?: { tier: string; billing: string } | null;
};

/** Effective plan for UI selection — unknown / missing tier row defaults to Free (not Pro). */
function pickerValue(sub: SubPayload | null): ManagerSkuTier {
  if (!sub) return "free";
  const fromTier = normalizeManagerSkuTier(sub.tier);
  if (fromTier) return fromTier;
  return "free";
}

function tierRank(t: ManagerSkuTier): number {
  if (t === "free") return 0;
  if (t === "pro") return 1;
  return 2;
}

function tierLabel(t: ManagerSkuTier): string {
  if (t === "free") return "Free";
  if (t === "pro") return "Pro";
  return "Business";
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ManagerPlan() {
  const router = useRouter();
  const pathname = usePathname();
  const planBasePath = pathname.startsWith("/owner")
    ? "/owner"
    : pathname.startsWith("/pro")
      ? "/pro"
      : "/manager";
  const { showToast } = useAppUi();
  const [sub, setSub] = useState<SubPayload | null>(null);
  const [pendingTier, setPendingTier] = useState<ManagerSkuTier>("free");
  const [pendingBilling, setPendingBilling] = useState<"monthly" | "annual">("monthly");
  /** Paid-tier checkout / subscription API — never reuse for billing portal (avoid clobbering Free card). */
  const [busyTier, setBusyTier] = useState<ManagerSkuTier | null>(null);
  const [billingSyncBusy, setBillingSyncBusy] = useState(false);
  const [billingPortalBusy, setBillingPortalBusy] = useState(false);
  const [resumeBusy, setResumeBusy] = useState(false);
  const [cancelDowngradeBusy, setCancelDowngradeBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/manager/subscription", { credentials: "include" });
      const body = (await res.json()) as SubPayload & { error?: string };
      if (!res.ok) {
        showToast(body.error ?? "Could not load subscription.");
        return;
      }
      setSub(body);
    } catch {
      showToast("Network error.");
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!sub?.billing) return;
    const b = sub.billing.toLowerCase();
    if (b !== "monthly" && b !== "annual") return;
    setPendingBilling(b);
  }, [sub?.billing]);

  const committedTier = useMemo(() => pickerValue(sub), [sub]);
  const committedBilling = useMemo<"monthly" | "annual">(() => {
    const b = sub?.billing?.toLowerCase();
    return b === "annual" ? "annual" : "monthly";
  }, [sub?.billing]);
  const annualLocked = committedBilling === "annual";

  useEffect(() => {
    setPendingTier(committedTier);
  }, [committedTier]);

  useEffect(() => {
    setPendingBilling(committedBilling);
  }, [committedBilling]);

  const checkoutHandledRef = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    const checkout = q.get("checkout");
    if (!checkout || checkoutHandledRef.current) return;
    checkoutHandledRef.current = true;

    const sessionId = q.get("session_id");

    void (async () => {
      if (checkout === "success" && sessionId) {
        try {
          const res = await fetch("/api/stripe/confirm-checkout-session", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId }),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            showToast(body.error ?? "Could not activate your plan from checkout.");
          }
        } catch {
          showToast("Could not activate your plan from checkout.");
        }
      }

      window.history.replaceState({}, "", pathname);

      if (checkout === "cancelled") {
        showToast("Checkout was cancelled.");
        return;
      }

      if (checkout === "success") {
        showToast("Payment received. Activating your plan…");
        for (let i = 0; i < 6; i++) {
          await load();
          if (i < 5) await new Promise((r) => setTimeout(r, 1400));
        }
      }
    })();
  }, [pathname, load, showToast]);

  const continueInCurrentTab = (url: string) => {
    window.location.assign(url);
  };

  const openBillingPortal = async () => {
    if (!sub?.stripeManaged || busyTier !== null || billingSyncBusy || billingPortalBusy) return;
    flushSync(() => setBillingPortalBusy(true));
    try {
      const res = await fetch("/api/stripe/billing-portal", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnPath: `${planBasePath}/plan` }),
      });
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        showToast(body.error ?? "Could not open billing portal.");
        return;
      }
      continueInCurrentTab(body.url);
    } catch {
      showToast("Network error.");
    } finally {
      setBillingPortalBusy(false);
    }
  };

  const startStripeCheckout = async (tier: "pro" | "business", billingInterval: "monthly" | "annual") => {
    flushSync(() => setBusyTier(tier));
    try {
      const res = await fetch("/api/stripe/checkout-portal", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier,
          billing: billingInterval,
          returnBasePath: planBasePath,
        }),
      });
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        showToast(body.error ?? "Could not start checkout.");
        setBusyTier(null);
        return;
      }
      continueInCurrentTab(body.url);
      setBusyTier(null);
    } catch {
      showToast("Network error.");
      setBusyTier(null);
    }
  };

  const setTierViaApi = async (tier: ManagerSkuTier, opts?: { billingInterval?: "monthly" | "annual"; billingOnly?: boolean }) => {
    if (opts?.billingOnly) flushSync(() => setBillingSyncBusy(true));
    else flushSync(() => setBusyTier(tier));
    try {
      const res = await fetch("/api/stripe/subscription/update-tier", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier,
          ...(tier !== "free" && sub?.stripeManaged ? { billing: opts?.billingInterval ?? pendingBilling } : {}),
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        message?: string;
        scheduledDowngrade?: boolean;
        cancelAtPeriodEnd?: boolean;
      };
      if (!res.ok) {
        showToast(body.error ?? "Could not update plan.");
        return;
      }
      if (body.message) {
        showToast(body.message);
      } else if (opts?.billingOnly) {
        const lab = opts.billingInterval === "annual" ? "annual" : "monthly";
        showToast(`Billing switched to ${lab} — charged to your saved card with proration.`);
      } else if (!body.scheduledDowngrade && !body.cancelAtPeriodEnd) {
        showToast(`Plan updated to ${tierLabel(tier)}.`);
      }
      await load();
      startTransition(() => router.refresh());
    } catch {
      showToast("Network error.");
    } finally {
      setBusyTier(null);
      setBillingSyncBusy(false);
    }
  };

  const resumeSubscription = async () => {
    if (!sub?.stripeManaged || resumeBusy) return;
    flushSync(() => setResumeBusy(true));
    try {
      const res = await fetch("/api/stripe/subscription/update-tier", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume: true }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        showToast(body.error ?? "Could not resume subscription.");
        return;
      }
      showToast("Subscription resumed — renewal will continue as normal.");
      await load();
      startTransition(() => router.refresh());
    } catch {
      showToast("Network error.");
    } finally {
      setResumeBusy(false);
    }
  };

  const cancelScheduledDowngrade = async () => {
    if (!sub?.stripeManaged || cancelDowngradeBusy) return;
    flushSync(() => setCancelDowngradeBusy(true));
    try {
      const res = await fetch("/api/stripe/subscription/update-tier", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel_downgrade" }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        showToast(body.error ?? "Could not cancel downgrade.");
        return;
      }
      showToast("Scheduled downgrade cancelled.");
      await load();
      startTransition(() => router.refresh());
    } catch {
      showToast("Network error.");
    } finally {
      setCancelDowngradeBusy(false);
    }
  };

  const handleTierAction = (target: ManagerSkuTier) => {
    if (!sub || busyTier !== null || billingSyncBusy || billingPortalBusy) return;
    setPendingTier(target);
  };

  const changeBillingInterval = (next: "monthly" | "annual") => {
    if (next === "monthly" && annualLocked) {
      showToast("Annual billing is locked and cannot switch back to monthly.");
      return;
    }
    setPendingBilling(next);
  };

  const isCurrent = (id: ManagerSkuTier) => id === committedTier;
  const isSelected = (id: ManagerSkuTier) => id === pendingTier;
  const hasPlanChange = pendingTier !== committedTier;
  const hasBillingChange =
    pendingBilling !== committedBilling &&
    pendingTier !== "free" &&
    (pendingTier === committedTier ? committedTier === "pro" || committedTier === "business" : true);
  const hasPendingChanges = hasPlanChange || hasBillingChange;

  const periodEndLabel = (unix: number | null | undefined) => {
    if (unix == null || typeof unix !== "number") return "the end of your billing period";
    return new Date(unix * 1000).toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const confirmChanges = async () => {
    if (!sub || !hasPendingChanges) return;
    if (
      hasPlanChange &&
      sub.stripeManaged &&
      pendingTier !== "free" &&
      tierRank(pendingTier) < tierRank(committedTier)
    ) {
      if (
        !window.confirm(
          "This downgrade is scheduled for your next billing renewal. You keep your current plan and limits until then. Continue?",
        )
      ) {
        return;
      }
    }
    if (pendingTier === "free" && committedTier !== "free") {
      const msg = sub.stripeManaged
        ? `Cancel your paid subscription? You keep Pro or Business features until ${periodEndLabel(sub.currentPeriodEnd ?? null)}, then the account moves to Free.`
        : "Confirm switch to Free plan? Paid features may be limited after you change.";
      if (!window.confirm(msg)) return;
    }
    if (hasPlanChange) {
      if (pendingTier === "free") {
        await setTierViaApi("free");
        return;
      }
      const paidTarget = pendingTier as "pro" | "business";
      if (!sub.stripeManaged) {
        await startStripeCheckout(paidTarget, pendingBilling);
        return;
      }
      await setTierViaApi(paidTarget, { billingInterval: pendingBilling });
      return;
    }
    if (hasBillingChange && (committedTier === "pro" || committedTier === "business")) {
      await setTierViaApi(committedTier, { billingInterval: pendingBilling, billingOnly: true });
    }
  };

  return (
    <ManagerPortalPageShell title="Plan">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-end">
          <div className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              disabled={billingSyncBusy || annualLocked}
              onClick={() => changeBillingInterval("monthly")}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
                pendingBilling === "monthly" ? "bg-primary text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              disabled={billingSyncBusy}
              onClick={() => changeBillingInterval("annual")}
              className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
                pendingBilling === "annual" ? "bg-primary text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Annual
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  pendingBilling === "annual" ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-700"
                }`}
              >
                Save ~20%
              </span>
            </button>
          </div>
          {hasPendingChanges ? (
            <Button
              type="button"
              className="shrink-0 rounded-full px-5"
              disabled={busyTier !== null || billingSyncBusy || billingPortalBusy}
              onClick={() => void confirmChanges()}
            >
              Confirm changes
            </Button>
          ) : null}
        </div>

        {!sub ? (
          <div className="grid gap-5 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-[420px] animate-pulse rounded-2xl border border-slate-200 bg-slate-100/80" aria-hidden />
            ))}
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-3">
            {MANAGER_PLAN_TIERS.map((t) => {
              const tierId = t.id as ManagerSkuTier;
              const pb = pendingBilling === "monthly" ? t.monthly : t.annual;
              const current = isCurrent(tierId);
              const selected = isSelected(tierId);
              const busyHere = busyTier === tierId;

              let ctaLabel = "";
              let ctaDisabled = (busyTier !== null || billingSyncBusy) && !busyHere;
              let showPrimary = true;

              if (tierId === "free") {
                if (sub.isFree) {
                  ctaLabel = "Current plan";
                  showPrimary = false;
                  ctaDisabled = true;
                } else {
                  ctaLabel = sub.stripeManaged ? "Cancel plan (end of period)" : "Switch to Free";
                  showPrimary = false;
                }
              } else if (current) {
                const bill = sub.billing?.toLowerCase();
                const hasInterval = sub.stripeManaged && (bill === "monthly" || bill === "annual");
                if (hasInterval) {
                  ctaLabel = bill === "annual" ? "Current plan (annual)" : "Current plan (monthly)";
                } else {
                  ctaLabel = `Current plan · ${tierLabel(tierId)}`;
                }
                showPrimary = false;
                ctaDisabled = true;
                if (selected && hasPendingChanges) {
                  ctaLabel = "Selected (confirm above)";
                  ctaDisabled = true;
                }
              } else if (!sub.stripeManaged && (tierId === "pro" || tierId === "business")) {
                ctaLabel = selected ? "Selected (confirm above)" : `Choose ${tierLabel(tierId)}`;
              } else if (sub.stripeManaged) {
                if (tierRank(tierId) > tierRank(committedTier)) {
                  ctaLabel = selected ? "Selected (confirm above)" : `Select ${tierLabel(tierId)}`;
                } else if (tierRank(tierId) < tierRank(committedTier)) {
                  ctaLabel = selected ? "Selected (confirm above)" : `Select ${tierLabel(tierId)}`;
                } else {
                  ctaLabel = "Update on file";
                  ctaDisabled = true;
                }
              } else {
                ctaLabel = selected ? "Selected (confirm above)" : `Choose ${tierLabel(tierId)}`;
              }

              return (
                <div
                  key={t.id}
                  className={`relative flex flex-col rounded-2xl border p-7 shadow-[0_12px_42px_-34px_rgba(15,23,42,0.26)] transition-shadow ${
                    selected
                      ? "border-2 border-primary bg-primary/[0.07] shadow-[0_8px_28px_-10px_rgba(0,122,255,0.35)] ring-1 ring-primary/20"
                      : "border border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  {tierId === "pro" ? (
                    <span className="absolute right-5 top-5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                      Popular
                    </span>
                  ) : null}

                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{t.label}</p>

                  <div className="mt-4 flex flex-nowrap items-baseline gap-x-1">
                    <span className="shrink-0 text-4xl font-black tracking-tight text-slate-900">{pb.headline}</span>
                    {pb.period ? (
                      <span className="whitespace-nowrap text-sm font-medium leading-none text-slate-400">{pb.period}</span>
                    ) : null}
                  </div>
                  <p className="mt-2 min-h-[40px] text-sm text-slate-500">{pb.sub}</p>

                  <Button
                    type="button"
                    variant={showPrimary ? "primary" : "outline"}
                    className="mt-6 w-full rounded-2xl py-6 text-[15px] font-semibold"
                    disabled={ctaDisabled || busyHere}
                    onClick={() => handleTierAction(tierId)}
                  >
                    {busyHere ? "Redirecting…" : ctaLabel}
                  </Button>

                  <div className="my-6 border-t border-slate-100" />

                  <ul className="space-y-3">
                    {t.features.map((f) => (
                      <li key={f.text} className="flex items-start gap-3 text-sm">
                        <span className={f.included ? "mt-0.5 text-primary" : "mt-0.5 text-slate-300"}>
                          <CheckIcon />
                        </span>
                        <span className={f.included ? "text-slate-700" : "text-slate-400"}>{f.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}

        {sub?.stripeManaged && (sub.scheduledDowngrade || sub.cancelAtPeriodEnd) ? (
          <div className="rounded-2xl border border-amber-200/90 bg-amber-50/90 px-5 py-4 text-sm text-amber-950">
            {sub.cancelAtPeriodEnd ? (
              <p>
                <span className="font-semibold">Cancellation scheduled.</span> Paid access ends on{" "}
                <span className="font-semibold">{periodEndLabel(sub.currentPeriodEnd ?? null)}</span>. You can resume before that date.
              </p>
            ) : sub.scheduledDowngrade ? (
              <p>
                <span className="font-semibold">Downgrade scheduled.</span> Your workspace stays on {tierLabel(committedTier)} until{" "}
                <span className="font-semibold">{periodEndLabel(sub.currentPeriodEnd ?? null)}</span>, then moves to{" "}
                {tierLabel(sub.scheduledDowngrade.tier as ManagerSkuTier)} ({sub.scheduledDowngrade.billing}) on that date.
              </p>
            ) : null}
            {sub.cancelAtPeriodEnd ? (
              <Button
                type="button"
                variant="outline"
                className="mt-3 rounded-full"
                disabled={resumeBusy}
                onClick={() => void resumeSubscription()}
              >
                {resumeBusy ? "Resuming…" : "Resume subscription"}
              </Button>
            ) : null}
            {!sub.cancelAtPeriodEnd && sub.scheduledDowngrade ? (
              <Button
                type="button"
                variant="outline"
                className="mt-3 rounded-full"
                disabled={cancelDowngradeBusy}
                onClick={() => void cancelScheduledDowngrade()}
              >
                {cancelDowngradeBusy ? "Cancelling…" : "Cancel downgrade"}
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="rounded-2xl border border-slate-200/90 bg-slate-50/80 px-5 py-4 text-sm text-slate-600">
          <span className="font-semibold text-slate-900">Billing: </span>
          {sub?.stripeManaged ? (
            <>
              Upgrades charge your saved card (Stripe invoices any proration). Downgrades to a lower paid tier start at your{" "}
              <span className="font-medium text-slate-800">next renewal</span>. Canceling ends paid access after the current period — use{" "}
              <span className="font-medium text-slate-800">Cancel plan</span> on Free or the button below. First-time paid signup opens Stripe
              Checkout in this tab.
            </>
          ) : (
            <>
              After you subscribe to Pro or Business, payment method and invoices are managed in Stripe (same card is reused when you upgrade or
              change billing interval).
            </>
          )}
          <Button
            type="button"
            variant="outline"
            className="ml-3 mt-2 inline-flex rounded-full px-4 py-2 text-[13px] sm:mt-0"
            disabled={billingPortalBusy || busyTier !== null || billingSyncBusy || !sub?.stripeManaged}
            title={
              sub && !sub.stripeManaged && !sub.isFree
                ? "Subscribe to a paid plan first to manage billing."
                : undefined
            }
            onClick={() => void openBillingPortal()}
          >
            Manage payment method & invoices
          </Button>
          {sub?.stripeManaged && !sub.isFree && !sub.cancelAtPeriodEnd ? (
            <Button
              type="button"
              variant="outline"
              className="ml-2 mt-2 inline-flex rounded-full border-rose-200 px-4 py-2 text-[13px] text-rose-800 hover:bg-rose-50 sm:mt-0"
              disabled={busyTier !== null || billingSyncBusy || billingPortalBusy}
              onClick={() => {
                setPendingTier("free");
                void (async () => {
                  if (
                    !window.confirm(
                      `Cancel your paid subscription? You keep ${tierLabel(committedTier)} features until ${periodEndLabel(sub.currentPeriodEnd ?? null)}, then the account becomes Free.`,
                    )
                  ) {
                    setPendingTier(committedTier);
                    return;
                  }
                  await setTierViaApi("free");
                })();
              }}
            >
              Cancel plan
            </Button>
          ) : null}
        </div>
      </div>
    </ManagerPortalPageShell>
  );
}
