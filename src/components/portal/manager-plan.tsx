"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { SegmentedThree } from "@/components/ui/segmented-control";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { MANAGER_TIER_MONTHLY_USD, type ManagerSkuTier } from "@/lib/manager-access";
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

  const monthlyDisplay = sub?.monthlyLabel ?? "—";
  const planBlurb = useMemo(() => {
    if (!sub) return "";
    const t = pickerValue(sub);
    if (t === "free") return "House posting only. Limited portal sections on the Free plan.";
    if (t === "pro") return "Up to 2 properties · matches $20/mo on the pricing page.";
    return "Unlimited scale · matches $200/mo on the pricing page.";
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
              Your account has legacy full access. Picking a plan records it on your account for the demo (portal billing).
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
      </div>
    </ManagerPortalPageShell>
  );
}
