"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { SegmentedThree } from "@/components/ui/segmented-control";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { formatManagerMonthlyLabel, type ManagerSkuTier } from "@/lib/manager-access";
import { useAppUi } from "@/components/providers/app-ui-provider";

type SubPayload = {
  tier: string | null;
  isPro: boolean;
  isBusiness: boolean;
  isFree: boolean;
  isLegacyUnlimited: boolean;
  proPropertyLimit: number;
  monthlyAmountUsd: number | null;
  monthlyLabel: string;
  /** When true, plan changes go through Stripe (prorated). */
  stripeManaged?: boolean;
};

function tierTitle(sub: SubPayload | null): string {
  if (!sub) return "…";
  if (sub.isLegacyUnlimited) return "Full access (legacy)";
  if (sub.isBusiness) return "Business";
  if (sub.isPro) return "Pro";
  if (sub.isFree) return "Free";
  return sub.tier ? sub.tier.charAt(0).toUpperCase() + sub.tier.slice(1) : "—";
}

/** Value for the plan picker; legacy accounts default to Pro until they choose. */
function pickerValue(sub: SubPayload | null): ManagerSkuTier {
  if (!sub) return "free";
  if (sub.isBusiness) return "business";
  if (sub.isPro) return "pro";
  if (sub.isFree) return "free";
  return "pro";
}

export function ManagerPlan() {
  const router = useRouter();
  const pathname = usePathname();
  const planReturnPath = pathname.startsWith("/owner") ? "/owner/plan" : "/manager/plan";
  const { showToast } = useAppUi();
  const [sub, setSub] = useState<SubPayload | null>(null);
  const [busy, setBusy] = useState(false);

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

  const selectedTier = useMemo(() => pickerValue(sub), [sub]);

  const openBillingPortal = async () => {
    if (!sub?.stripeManaged || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/stripe/billing-portal", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnPath: planReturnPath }),
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
      setBusy(false);
    }
  };

  const setTier = async (tier: ManagerSkuTier) => {
    if (!sub || busy) return;
    if (tier === selectedTier && !sub.isLegacyUnlimited) return;
    setBusy(true);
    try {
      const res = await fetch("/api/stripe/subscription/update-tier", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        showToast(body.error ?? "Could not update plan.");
        return;
      }
      const label = tier === "free" ? "Free" : tier === "pro" ? "Pro" : "Business";
      showToast(sub?.stripeManaged ? `Plan updated — Stripe billing adjusted (${label}).` : `Plan updated to ${label}.`);
      await load();
      router.refresh();
    } catch {
      showToast("Network error.");
    } finally {
      setBusy(false);
    }
  };

  const cancelToFree = async () => {
    if (!sub || busy || sub.isFree) return;
    const ok = window.confirm(
      "Cancel your subscription and move to the Free plan? Paid features such as leases and work orders may be locked until you upgrade again.",
    );
    if (!ok) return;
    await setTier("free");
  };

  /** Legacy accounts have no tier in DB — estimate from the plan picker instead of "—". */
  const monthlyDisplay = useMemo(() => {
    if (!sub) return "—";
    if (sub.monthlyAmountUsd !== null) return sub.monthlyLabel;
    const pick = pickerValue(sub);
    return formatManagerMonthlyLabel(pick);
  }, [sub]);
  const planBlurb = useMemo(() => {
    if (!sub) return "";
    const t = pickerValue(sub);
    if (t === "free")
      return "Listings, rent collection, applications, payments, and Stripe payouts. Upgrade to Pro for lease generation, work orders, and up to 2 properties ($20/mo on the pricing page).";
    if (t === "pro")
      return "Everything in Free, plus lease generation and work orders — up to 2 properties · matches $20/mo on the pricing page.";
    return "Everything in Pro — up to 20 properties and direct meetings with admins for support · matches $200/mo on the pricing page.";
  }, [sub]);

  return (
    <ManagerPortalPageShell
      title="Plan"
      titleAside={
        <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={() => void load()} disabled={busy}>
          Refresh
        </Button>
      }
    >
      <div className="space-y-8">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payment per month (estimated)</p>
          <p className="mt-2 text-4xl font-bold tabular-nums tracking-tight text-slate-900">{monthlyDisplay}</p>
          {sub?.isLegacyUnlimited ? (
            <p className="mt-1 text-xs text-slate-500">Estimated from the plan you select below until you save.</p>
          ) : null}
          {sub?.stripeManaged ? (
            <p className="mt-2 text-xs font-medium text-emerald-800">Stripe subscription — changing plan updates your subscription (prorations may apply).</p>
          ) : null}
          {sub ? <p className="mt-2 text-sm text-slate-500">{planBlurb}</p> : <p className="mt-2 text-sm text-slate-500">Loading…</p>}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Choose plan</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{tierTitle(sub)}</p>
          {sub?.isLegacyUnlimited ? (
            <p className="mt-2 max-w-xl text-sm text-slate-600">
              No plan row on file yet — pricing follows your selection below. Saving applies it for portal billing (and Stripe when connected).
            </p>
          ) : null}
          <div className={`mt-4 max-w-lg ${busy || !sub ? "pointer-events-none opacity-60" : ""}`}>
            {sub ? (
              <SegmentedThree<ManagerSkuTier>
                value={selectedTier}
                onChange={(tier) => void setTier(tier)}
                first={{ id: "free", label: "Free" }}
                second={{ id: "pro", label: "Pro" }}
                third={{ id: "business", label: "Business" }}
              />
            ) : (
              <div className="h-[46px] max-w-lg animate-pulse rounded-2xl bg-slate-100" aria-hidden />
            )}
            <p className="mt-3 text-xs text-slate-500">
              Applies to this signed-in account immediately.{" "}
              <Link href="/partner/pricing" className="font-medium text-primary underline underline-offset-2">
                Compare plans
              </Link>
            </p>
          </div>
        </div>

        {!sub ? <p className="text-sm text-slate-500">Loading subscription…</p> : null}

        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Billing & subscription</p>
          <p className="mt-2 text-sm text-slate-600">
            Update the card on file, download invoices, or cancel through Stripe when your plan is billed there. Otherwise use the plan
            picker above — choosing Free cancels an active Stripe subscription when one is linked.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              disabled={busy || !sub?.stripeManaged}
              onClick={() => void openBillingPortal()}
            >
              Payment method & invoices
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-full border-rose-200 text-rose-900 hover:bg-rose-50"
              disabled={busy || !sub || sub.isFree}
              onClick={() => void cancelToFree()}
            >
              Cancel to Free
            </Button>
          </div>
          {!sub?.stripeManaged && sub && !sub.isFree ? (
            <p className="mt-3 text-xs text-slate-500">Stripe Customer Portal opens when this account has an active Stripe subscription.</p>
          ) : null}
        </div>
      </div>
    </ManagerPortalPageShell>
  );
}
