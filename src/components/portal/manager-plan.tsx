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
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  /** Paid-tier checkout / subscription API — never reuse for billing portal (avoid clobbering Free card). */
  const [busyTier, setBusyTier] = useState<ManagerSkuTier | null>(null);
  const [billingSyncBusy, setBillingSyncBusy] = useState(false);
  const [billingPortalBusy, setBillingPortalBusy] = useState(false);

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
    if (b === "monthly" || b === "annual") setBilling(b);
  }, [sub?.billing]);

  const committedTier = useMemo(() => pickerValue(sub), [sub]);

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
      window.location.href = body.url;
    } catch {
      showToast("Network error.");
    } finally {
      setBillingPortalBusy(false);
    }
  };

  const startStripeCheckout = async (tier: "pro" | "business") => {
    flushSync(() => setBusyTier(tier));
    try {
      const res = await fetch("/api/stripe/checkout-portal", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier,
          billing,
          returnBasePath: planBasePath,
        }),
      });
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        showToast(body.error ?? "Could not start checkout.");
        setBusyTier(null);
        return;
      }
      window.location.assign(body.url);
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
          ...(tier !== "free" && sub?.stripeManaged ? { billing: opts?.billingInterval ?? billing } : {}),
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        showToast(body.error ?? "Could not update plan.");
        return;
      }
      if (opts?.billingOnly) {
        const lab = opts.billingInterval === "annual" ? "annual" : "monthly";
        showToast(`Billing switched to ${lab} — charged to your saved card with proration.`);
      } else {
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

  const handleTierAction = (target: ManagerSkuTier) => {
    if (!sub || busyTier !== null || billingSyncBusy || billingPortalBusy) return;

    if (target === committedTier) return;

    if (target === "free" && !sub.isFree) {
      if (!window.confirm("Switch to the Free plan? Paid features may be limited after you change.")) return;
      void setTierViaApi("free");
      return;
    }

    if (target === "free") return;

    const paidTarget = target as "pro" | "business";

    if (!sub.stripeManaged) {
      void startStripeCheckout(paidTarget);
      return;
    }

    /** Upgrades/downgrades between Pro and Business bill the payment method already on file — no Checkout. */
    void setTierViaApi(paidTarget);
  };

  const changeBillingInterval = (next: "monthly" | "annual") => {
    setBilling(next);
    if (!sub?.stripeManaged || billingSyncBusy || busyTier !== null || billingPortalBusy) return;
    if (committedTier !== "pro" && committedTier !== "business") return;

    const server = sub.billing?.toLowerCase();
    const serverNorm = server === "monthly" || server === "annual" ? server : null;
    const baseline = serverNorm ?? billing;
    if (baseline === next) return;

    void setTierViaApi(committedTier, { billingInterval: next, billingOnly: true });
  };

  const isCurrent = (id: ManagerSkuTier) => id === committedTier;

  return (
    <ManagerPortalPageShell title="Plan">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-end">
          <div className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              disabled={billingSyncBusy}
              onClick={() => changeBillingInterval("monthly")}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
                billing === "monthly" ? "bg-primary text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              disabled={billingSyncBusy}
              onClick={() => changeBillingInterval("annual")}
              className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
                billing === "annual" ? "bg-primary text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Annual
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  billing === "annual" ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-700"
                }`}
              >
                Save ~20%
              </span>
            </button>
          </div>
        </div>

        {!sub ? (
          <div className="grid gap-5 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-[420px] animate-pulse rounded-3xl border border-slate-200 bg-slate-100/80" aria-hidden />
            ))}
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-3">
            {MANAGER_PLAN_TIERS.map((t) => {
              const tierId = t.id as ManagerSkuTier;
              const pb = billing === "monthly" ? t.monthly : t.annual;
              const current = isCurrent(tierId);
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
                  ctaLabel = "Switch to Free";
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
              } else if (!sub.stripeManaged && (tierId === "pro" || tierId === "business")) {
                ctaLabel = `Subscribe · ${tierLabel(tierId)}`;
              } else if (sub.stripeManaged) {
                if (tierRank(tierId) > tierRank(committedTier)) {
                  ctaLabel = `Upgrade to ${tierLabel(tierId)}`;
                } else if (tierRank(tierId) < tierRank(committedTier)) {
                  ctaLabel = `Switch to ${tierLabel(tierId)}`;
                } else {
                  ctaLabel = "Update on file";
                  ctaDisabled = true;
                }
              } else {
                ctaLabel = `Subscribe · ${tierLabel(tierId)}`;
              }

              return (
                <div
                  key={t.id}
                  className={`relative flex flex-col rounded-3xl border p-7 shadow-[0_4px_24px_-4px_rgba(15,23,42,0.08)] transition-shadow ${
                    current
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

        <div className="rounded-2xl border border-slate-200/90 bg-white px-5 py-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Axis platform fees</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            When residents pay application fees or rent through Axis with live processing, these platform fees apply before payouts (unless overridden in
            your environment).
          </p>
          <ul className="mt-4 space-y-2 text-sm text-slate-700">
            <li>
              <span className="font-semibold text-slate-900">Free</span> — 2% of application fees · 0.25% of rent collected
            </li>
            <li>
              <span className="font-semibold text-slate-900">Pro</span> — 2% of application fees · 0% on rent
            </li>
            <li>
              <span className="font-semibold text-slate-900">Business</span> — 0% on application fees & rent (no Axis take on those payments)
            </li>
          </ul>
          <p className="mt-3 text-xs text-slate-500">
            Limits at a glance: Free — 1 property, no leases/work orders, 1 linked partner per tab. Pro — 2 of each. Business — 20 of each, plus zero
            platform fees above.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-slate-50/80 px-5 py-4 text-sm text-slate-600">
          <span className="font-semibold text-slate-900">Billing: </span>
          {sub?.stripeManaged ? (
            <>
              Plan changes and switching between monthly and annual use your{" "}
              <span className="font-medium text-slate-800">saved card on file</span> — no checkout. Open Stripe to replace the card or download
              invoices.
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
        </div>
      </div>
    </ManagerPortalPageShell>
  );
}
