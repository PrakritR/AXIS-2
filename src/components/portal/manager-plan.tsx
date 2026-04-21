"use client";

import { usePathname, useRouter } from "next/navigation";
import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { SegmentedThree } from "@/components/ui/segmented-control";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import type { ManagerSkuTier } from "@/lib/manager-access";
import { useAppUi } from "@/components/providers/app-ui-provider";

type SubPayload = {
  tier: string | null;
  isPro: boolean;
  isBusiness: boolean;
  isFree: boolean;
  isLegacyUnlimited: boolean;
  /** When true, plan changes go through Stripe (prorated). */
  stripeManaged?: boolean;
};

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
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

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
      showToast(sub?.stripeManaged ? `Plan updated (${label}).` : `Plan updated to ${label}.`);
      await load();
      startTransition(() => {
        router.refresh();
      });
    } catch {
      showToast("Network error.");
    } finally {
      setBusy(false);
    }
  };

  const cancelToFreeClick = () => {
    if (!sub || busy || sub.isFree) return;
    setShowCancelConfirm(true);
  };

  const confirmCancelToFree = () => {
    setShowCancelConfirm(false);
    requestAnimationFrame(() => {
      void setTier("free");
    });
  };

  return (
    <ManagerPortalPageShell title="Plan">
      <div className="max-w-lg space-y-8 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
        <div className={`space-y-4 ${busy || !sub ? "pointer-events-none opacity-60" : ""}`}>
          {sub ? (
            <SegmentedThree<ManagerSkuTier>
              value={selectedTier}
              onChange={(tier) => void setTier(tier)}
              first={{ id: "free", label: "Free" }}
              second={{ id: "pro", label: "Pro" }}
              third={{ id: "business", label: "Business" }}
            />
          ) : (
            <div className="h-[46px] animate-pulse rounded-2xl bg-slate-100" aria-hidden />
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="primary"
            className="rounded-full"
            disabled={busy || !sub?.stripeManaged}
            title={
              sub && !sub.stripeManaged && !sub.isFree
                ? "Requires an active Stripe subscription on this account."
                : undefined
            }
            onClick={() => void openBillingPortal()}
          >
            Update payment method
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-full border-rose-200 text-rose-900 hover:bg-rose-50"
            disabled={busy || !sub || sub.isFree}
            onClick={cancelToFreeClick}
          >
            Cancel to Free
          </Button>
        </div>

        {showCancelConfirm ? (
          <div
            className="rounded-xl border border-rose-200/80 bg-rose-50/70 px-4 py-3 text-sm text-rose-950"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-free-title"
          >
            <p id="cancel-free-title" className="font-medium">
              Switch to the Free plan?
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="primary" className="rounded-full text-sm" disabled={busy} onClick={confirmCancelToFree}>
                Yes, switch to Free
              </Button>
              <Button type="button" variant="outline" className="rounded-full text-sm" disabled={busy} onClick={() => setShowCancelConfirm(false)}>
                Keep current plan
              </Button>
            </div>
          </div>
        ) : null}

      </div>
    </ManagerPortalPageShell>
  );
}
