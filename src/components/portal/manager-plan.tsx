"use client";

import { usePathname, useRouter } from "next/navigation";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { formatPacificDate } from "@/lib/pacific-time";
import { MANAGER_PLAN_TIERS, type ManagerPlanTierDefinition } from "@/data/manager-plan-tiers";
import { normalizeManagerSkuTier, type ManagerSkuTier } from "@/lib/manager-access";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { submitBugFeedbackReport } from "@/lib/portal-bug-feedback";
import { loadManagerPlanTiers } from "@/lib/site-content";

type SubPayload = {
  tier: string | null;
  billing: string | null;
  isPro: boolean;
  isBusiness: boolean;
  isFree: boolean;
  isLegacyUnlimited: boolean;
  stripeManaged?: boolean;
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: number | null;
  scheduledDowngrade?: { tier: string; billing: string } | null;
};

function committedTier(sub: SubPayload | null): ManagerSkuTier {
  if (!sub) return "free";
  return normalizeManagerSkuTier(sub.tier) ?? "free";
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

function tierTagline(t: ManagerSkuTier): string {
  if (t === "free") return "1 property · applications & touring";
  if (t === "pro") return "Full resident management · up to 2 properties";
  return "Portfolio scale · up to 20 properties";
}

function CheckIcon({ muted }: { muted?: boolean }) {
  return (
    <svg className={`h-4 w-4 shrink-0 ${muted ? "text-slate-300" : "text-primary"}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function periodEndLabel(unix: number | null | undefined): string | null {
  if (unix == null || typeof unix !== "number" || !Number.isFinite(unix) || unix <= 0) return null;
  return formatPacificDate(new Date(unix * 1000), { month: "long", day: "numeric", year: "numeric" });
}

type PlanFeedbackModalState =
  | null
  | {
      kind: "annual_to_monthly";
    }
  | {
      kind: "cancel_plan";
      fromTier: ManagerSkuTier;
    };

export function ManagerPlan() {
  const router = useRouter();
  const pathname = usePathname();
  const planBasePath = "/portal";
  const { showToast } = useAppUi();
  const { userId, email } = useManagerUserId();
  const [sub, setSub] = useState<SubPayload | null>(null);
  const [priceView, setPriceView] = useState<"monthly" | "annual">("monthly");
  const [planTiers, setPlanTiers] = useState<ManagerPlanTierDefinition[]>(MANAGER_PLAN_TIERS);
  const [busyTier, setBusyTier] = useState<ManagerSkuTier | null>(null);
  const [billingSyncBusy, setBillingSyncBusy] = useState(false);
  const [billingPortalBusy, setBillingPortalBusy] = useState(false);
  const [resumeBusy, setResumeBusy] = useState(false);
  const [cancelDowngradeBusy, setCancelDowngradeBusy] = useState(false);
  const [feedbackModal, setFeedbackModal] = useState<PlanFeedbackModalState>(null);
  const [feedbackReason, setFeedbackReason] = useState("");
  const [feedbackBusy, setFeedbackBusy] = useState(false);

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
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

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

  const currentTier = useMemo(() => committedTier(sub), [sub]);
  const currentBilling = useMemo<"monthly" | "annual">(() => {
    const b = sub?.billing?.toLowerCase();
    return b === "annual" ? "annual" : "monthly";
  }, [sub?.billing]);
  const renewalLabel = periodEndLabel(sub?.currentPeriodEnd ?? null);
  const anyBusy = busyTier !== null || billingSyncBusy || billingPortalBusy || resumeBusy || cancelDowngradeBusy || feedbackBusy;

  useEffect(() => {
    const id = window.setTimeout(() => setPriceView(currentBilling), 0);
    return () => window.clearTimeout(id);
  }, [currentBilling]);

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

  const submitPlanChangeFeedback = useCallback(
    async (title: string, reason: string) => {
      if (!userId || !email?.includes("@")) return;
      await submitBugFeedbackReport({
        type: "feedback",
        reporterUserId: userId,
        reporterName: email,
        reporterEmail: email,
        reporterRole: "manager",
        title,
        description: reason,
        pageUrl: typeof window !== "undefined" ? window.location.href : `${planBasePath}/plan`,
      });
    },
    [email, planBasePath, userId],
  );

  const closeFeedbackModal = useCallback(() => {
    if (feedbackBusy) return;
    setFeedbackModal(null);
    setFeedbackReason("");
  }, [feedbackBusy]);

  const scheduledBillingChange =
    sub?.scheduledDowngrade &&
    !sub.cancelAtPeriodEnd &&
    sub.scheduledDowngrade.tier === currentTier &&
    sub.scheduledDowngrade.billing !== currentBilling;

  const openBillingPortal = async () => {
    if (!sub?.stripeManaged || anyBusy) return;
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
        body: JSON.stringify({ tier, billing: billingInterval, returnBasePath: planBasePath }),
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

  const setTierViaApi = async (
    tier: ManagerSkuTier,
    opts?: { billingInterval?: "monthly" | "annual"; billingOnly?: boolean },
  ) => {
    if (opts?.billingOnly) flushSync(() => setBillingSyncBusy(true));
    else flushSync(() => setBusyTier(tier));
    try {
      const res = await fetch("/api/stripe/subscription/update-tier", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier,
          ...(tier !== "free" && sub?.stripeManaged ? { billing: opts?.billingInterval ?? priceView } : {}),
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
      if (body.message) showToast(body.message);
      else if (opts?.billingOnly) {
        showToast(`Now billed ${opts.billingInterval === "annual" ? "annually" : "monthly"}.`);
      } else if (!body.scheduledDowngrade && !body.cancelAtPeriodEnd) {
        showToast(`You're now on ${tierLabel(tier)}.`);
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
      showToast("Subscription resumed.");
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

  const switchBillingInterval = async (next: "monthly" | "annual") => {
    if (!sub || currentTier === "free" || !sub.stripeManaged || anyBusy) return;
    if (next === currentBilling) return;

    if (next === "monthly" && currentBilling === "annual") {
      setFeedbackReason("");
      setFeedbackModal({ kind: "annual_to_monthly" });
      return;
    }

    const renewalNote = renewalLabel ? ` on ${renewalLabel}` : " at your next renewal";
    if (
      !window.confirm(
        `Switch to annual billing? You'll be billed annually (~20% savings). After one year${renewalNote}, you can switch back to monthly billing if you prefer.`,
      )
    ) {
      return;
    }
    await setTierViaApi(currentTier, { billingInterval: next, billingOnly: true });
  };

  const confirmAnnualToMonthly = async () => {
    const reason = feedbackReason.trim();
    if (!reason) {
      showToast("Please tell us why you're switching to monthly billing.");
      return;
    }
    setFeedbackBusy(true);
    try {
      await submitPlanChangeFeedback("Plan: switch from annual to monthly billing", reason);
      setFeedbackModal(null);
      setFeedbackReason("");
      await setTierViaApi(currentTier, { billingInterval: "monthly", billingOnly: true });
    } catch {
      showToast("Could not send feedback. Try again.");
    } finally {
      setFeedbackBusy(false);
    }
  };

  const confirmCancelPlan = async () => {
    const reason = feedbackReason.trim();
    if (!reason) {
      showToast("Please tell us why you're cancelling.");
      return;
    }
    setFeedbackBusy(true);
    try {
      await submitPlanChangeFeedback(`Plan: cancelled ${tierLabel(currentTier)} subscription`, reason);
      setFeedbackModal(null);
      setFeedbackReason("");
      await setTierViaApi("free");
    } catch {
      showToast("Could not send feedback. Try again.");
    } finally {
      setFeedbackBusy(false);
    }
  };

  const changePlan = async (target: ManagerSkuTier) => {
    if (!sub || anyBusy || target === currentTier) return;

    if (
      sub.stripeManaged &&
      target !== "free" &&
      tierRank(target) < tierRank(currentTier)
    ) {
      if (
        !window.confirm(
          `Downgrade to ${tierLabel(target)} at your next renewal? You keep ${tierLabel(currentTier)} until then.`,
        )
      ) {
        return;
      }
    }

    if (target === "free" && currentTier !== "free") {
      const msg = sub.stripeManaged
        ? `Cancel your ${tierLabel(currentTier)} subscription? You keep paid features until ${
            renewalLabel ?? "the end of your billing period"
          }, then move to Free.`
        : `Switch to the Free plan? Some features will be limited.`;
      if (!window.confirm(msg)) return;
      setFeedbackReason("");
      setFeedbackModal({ kind: "cancel_plan", fromTier: currentTier });
      return;
    }

    const paidTarget = target as "pro" | "business";
    if (!sub.stripeManaged) {
      await startStripeCheckout(paidTarget, priceView);
      return;
    }

    if (tierRank(paidTarget) > tierRank(currentTier)) {
      if (!window.confirm(`Upgrade to ${tierLabel(paidTarget)} now? Your card will be charged with proration.`)) return;
    }

    await setTierViaApi(paidTarget, { billingInterval: priceView });
  };

  const planActionLabel = (tierId: ManagerSkuTier): string => {
    if (tierId === currentTier) return "Current plan";
    if (sub?.scheduledDowngrade?.tier === tierId) return "Scheduled";
    if (tierRank(tierId) > tierRank(currentTier)) return `Upgrade to ${tierLabel(tierId)}`;
    return `Switch to ${tierLabel(tierId)}`;
  };

  return (
    <ManagerPortalPageShell title="Plan">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Current plan summary */}
        {!sub ? (
          <div className="h-36 animate-pulse rounded-2xl border border-slate-200 bg-slate-100/80" aria-hidden />
        ) : (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/80 shadow-[0_8px_30px_-18px_rgba(15,23,42,0.2)]">
            <div className="border-b border-slate-100 px-6 py-5 sm:px-8">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Your plan</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-bold tracking-tight text-slate-950">{tierLabel(currentTier)}</h2>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">Active</span>
                {sub.cancelAtPeriodEnd ? (
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
                    Cancelling
                  </span>
                ) : null}
                {sub.scheduledDowngrade && !sub.cancelAtPeriodEnd ? (
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
                    Downgrade scheduled
                  </span>
                ) : null}
              </div>
              <p className="mt-1.5 text-sm text-slate-600">{tierTagline(currentTier)}</p>
            </div>

            <div className="grid gap-5 px-6 py-5 sm:grid-cols-2 sm:px-8">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Billing</p>
                {currentTier === "free" ? (
                  <p className="mt-1 text-sm font-medium text-slate-800">No subscription</p>
                ) : sub.stripeManaged ? (
                  <p className="mt-1 text-sm font-medium text-slate-800">
                    {currentBilling === "annual" ? "Billed annually" : "Billed monthly"}
                    {renewalLabel ? (
                      <>
                        {" "}
                        · Renews <span className="text-slate-600">{renewalLabel}</span>
                      </>
                    ) : null}
                  </p>
                ) : (
                  <p className="mt-1 text-sm font-medium text-slate-800">{tierLabel(currentTier)} (not Stripe-managed)</p>
                )}
              </div>

              <div className="flex flex-wrap items-end gap-2 sm:justify-end">
                {sub.stripeManaged && currentTier !== "free" ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full text-[13px]"
                    disabled={anyBusy}
                    onClick={() => void openBillingPortal()}
                  >
                    {billingPortalBusy ? "Opening…" : "Payment & invoices"}
                  </Button>
                ) : null}
              </div>
            </div>

            {sub.stripeManaged && currentTier !== "free" && !sub.cancelAtPeriodEnd ? (
              <div className="border-t border-slate-100 px-6 py-4 sm:px-8">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Billing cycle</p>
                <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1">
                  <button
                    type="button"
                    disabled={billingSyncBusy}
                    onClick={() => void switchBillingInterval("monthly")}
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                      currentBilling === "monthly" ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    disabled={billingSyncBusy}
                    onClick={() => void switchBillingInterval("annual")}
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                      currentBilling === "annual" ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Annual
                  </button>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {currentBilling === "annual"
                    ? scheduledBillingChange
                      ? `Monthly billing starts${renewalLabel ? ` on ${renewalLabel}` : " at the end of your annual period"}.`
                      : `On annual billing for one year. Switching to monthly takes effect${renewalLabel ? ` on ${renewalLabel}` : " at the end of your annual period"}.`
                    : "Monthly billing renews each month. Switch to annual anytime for ~20% savings; after one year you can switch back to monthly."}
                </p>
              </div>
            ) : null}

            {sub.stripeManaged && (sub.scheduledDowngrade || sub.cancelAtPeriodEnd) ? (
              <div className="border-t border-amber-100 bg-amber-50/80 px-6 py-4 sm:px-8">
                {sub.cancelAtPeriodEnd ? (
                  <p className="text-sm text-amber-950">
                    <span className="font-semibold">Cancellation scheduled.</span>{" "}
                    {renewalLabel
                      ? `Paid access ends ${renewalLabel}.`
                      : "Paid access ends at the close of your billing period."}
                  </p>
                ) : sub.scheduledDowngrade ? (
                  <p className="text-sm text-amber-950">
                    <span className="font-semibold">
                      {scheduledBillingChange ? "Billing change scheduled." : "Downgrade scheduled."}
                    </span>{" "}
                    {scheduledBillingChange
                      ? renewalLabel
                        ? `You'll switch to monthly billing on ${renewalLabel}.`
                        : "You'll switch to monthly billing at the end of your annual period."
                      : renewalLabel
                        ? `You'll move to ${tierLabel(sub.scheduledDowngrade.tier as ManagerSkuTier)} (${sub.scheduledDowngrade.billing}) on ${renewalLabel}.`
                        : `You'll move to ${tierLabel(sub.scheduledDowngrade.tier as ManagerSkuTier)} at your next renewal.`}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {sub.cancelAtPeriodEnd ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full text-[13px]"
                      disabled={resumeBusy}
                      onClick={() => void resumeSubscription()}
                    >
                      {resumeBusy ? "Resuming…" : "Keep my plan"}
                    </Button>
                  ) : null}
                  {sub.scheduledDowngrade && !sub.cancelAtPeriodEnd ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full text-[13px]"
                      disabled={cancelDowngradeBusy}
                      onClick={() => void cancelScheduledDowngrade()}
                    >
                      {cancelDowngradeBusy ? "Cancelling…" : "Cancel downgrade"}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>
        )}

        {/* Compare plans */}
        <section>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Compare plans</h3>
              <p className="mt-0.5 text-sm text-slate-500">Choose a plan below. Upgrades apply immediately; downgrades and billing changes take effect at renewal.</p>
            </div>
            <div className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setPriceView("monthly")}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                  priceView === "monthly" ? "bg-primary text-white" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setPriceView("annual")}
                className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                  priceView === "annual" ? "bg-primary text-white" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Annual
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    priceView === "annual" ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  −20%
                </span>
              </button>
            </div>
          </div>

          {!sub ? (
            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-80 animate-pulse rounded-2xl border border-slate-200 bg-slate-100/80" aria-hidden />
              ))}
            </div>
          ) : (
            <div className="mt-5 grid gap-4 lg:grid-cols-3 lg:items-stretch">
              {planTiers.map((t) => {
                const tierId = t.id as ManagerSkuTier;
                const pb = priceView === "monthly" ? t.monthly : t.annual;
                const isCurrent = tierId === currentTier;
                const isScheduled = sub.scheduledDowngrade?.tier === tierId;
                const busyHere = busyTier === tierId;
                const isUpgrade = tierRank(tierId) > tierRank(currentTier);
                const actionLabel = planActionLabel(tierId);

                return (
                  <article
                    key={t.id}
                    className={`relative flex h-full flex-col rounded-2xl border p-6 transition ${
                      isCurrent
                        ? "border-2 border-primary bg-primary/[0.04] shadow-[0_4px_24px_-12px_rgba(0,122,255,0.35)]"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    {tierId === "pro" && !isCurrent ? (
                      <span className="absolute right-4 top-4 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                        Popular
                      </span>
                    ) : null}

                    <div className="min-h-[28px]">
                      {isCurrent ? (
                        <span className="inline-flex rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                          Current plan
                        </span>
                      ) : isScheduled ? (
                        <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                          Starts {renewalLabel ?? "at renewal"}
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                          {t.label}
                        </span>
                      )}
                    </div>

                    <div className="mt-3 flex items-baseline gap-1">
                      <span className="text-3xl font-black tracking-tight text-slate-900">{pb.headline}</span>
                      {pb.period ? <span className="text-sm font-medium text-slate-400">{pb.period}</span> : null}
                    </div>
                    <p className="mt-2 min-h-[4.5rem] text-sm leading-snug text-slate-500">{pb.sub}</p>

                    <div className="mt-5 min-h-[52px]">
                      {isCurrent ? (
                        <div className="flex h-[52px] items-center justify-center rounded-xl border border-primary/20 bg-primary/5 px-4 text-sm font-semibold text-primary">
                          You&apos;re on this plan
                        </div>
                      ) : isScheduled ? (
                        <div className="flex h-[52px] items-center justify-center rounded-xl border border-amber-200 bg-amber-50 px-4 text-sm font-semibold text-amber-900">
                          Downgrade scheduled
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant={isUpgrade ? "primary" : "outline"}
                          className="h-[52px] w-full rounded-xl text-[15px] font-semibold"
                          disabled={anyBusy && !busyHere}
                          onClick={() => void changePlan(tierId)}
                        >
                          {busyHere ? "Processing…" : actionLabel}
                        </Button>
                      )}
                    </div>

                    <ul className="mt-5 space-y-2.5 border-t border-slate-100 pt-5">
                      {t.features.map((f) => (
                        <li key={f.text} className="flex items-start gap-2.5 text-sm">
                          <CheckIcon muted={!f.included} />
                          <span className={f.included ? "text-slate-700" : "text-slate-400"}>{f.text}</span>
                        </li>
                      ))}
                    </ul>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {sub && !sub.stripeManaged && !sub.isFree ? (
          <p className="text-center text-xs text-slate-500">
            Subscribe through the buttons above to manage billing in Stripe.
          </p>
        ) : null}
      </div>

      <Modal
        open={feedbackModal !== null}
        title={
          feedbackModal?.kind === "annual_to_monthly"
            ? "Switch to monthly billing"
            : feedbackModal?.kind === "cancel_plan"
              ? "Before you cancel"
              : ""
        }
        onClose={closeFeedbackModal}
      >
        {feedbackModal?.kind === "annual_to_monthly" ? (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-slate-600">
              You&apos;re currently on <span className="font-semibold text-slate-900">annual billing</span>. Switching to
              monthly will take effect
              {renewalLabel ? (
                <>
                  {" "}
                  on <span className="font-semibold text-slate-900">{renewalLabel}</span>
                </>
              ) : (
                " at the end of your current annual period"
              )}
              . You&apos;ll keep annual billing until then.
            </p>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-800" htmlFor="plan-feedback-reason">
                Why are you switching to monthly billing? *
              </label>
              <Textarea
                id="plan-feedback-reason"
                value={feedbackReason}
                onChange={(e) => setFeedbackReason(e.target.value)}
                rows={4}
                placeholder="Tell us what we could do better…"
              />
              <p className="text-xs text-slate-500">Your response is sent to the Axis team as feedback.</p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" className="rounded-full" disabled={feedbackBusy} onClick={closeFeedbackModal}>
                Keep annual
              </Button>
              <Button
                type="button"
                variant="primary"
                className="rounded-full"
                disabled={feedbackBusy}
                onClick={() => void confirmAnnualToMonthly()}
              >
                {feedbackBusy ? "Scheduling…" : "Schedule monthly billing"}
              </Button>
            </div>
          </div>
        ) : feedbackModal?.kind === "cancel_plan" ? (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-slate-600">
              You&apos;ll keep <span className="font-semibold text-slate-900">{tierLabel(feedbackModal.fromTier)}</span>{" "}
              until
              {renewalLabel ? (
                <>
                  {" "}
                  <span className="font-semibold text-slate-900">{renewalLabel}</span>
                </>
              ) : (
                " the end of your billing period"
              )}
              , then move to Free.
            </p>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-800" htmlFor="plan-cancel-reason">
                Why are you cancelling? *
              </label>
              <Textarea
                id="plan-cancel-reason"
                value={feedbackReason}
                onChange={(e) => setFeedbackReason(e.target.value)}
                rows={4}
                placeholder="Tell us what we could do better…"
              />
              <p className="text-xs text-slate-500">Your response is sent to the Axis team as feedback.</p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" className="rounded-full" disabled={feedbackBusy} onClick={closeFeedbackModal}>
                Keep my plan
              </Button>
              <Button
                type="button"
                variant="primary"
                className="rounded-full"
                disabled={feedbackBusy}
                onClick={() => void confirmCancelPlan()}
              >
                {feedbackBusy ? "Cancelling…" : "Confirm cancellation"}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </ManagerPortalPageShell>
  );
}
