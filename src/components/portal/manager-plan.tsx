"use client";

import { usePathname, useRouter } from "next/navigation";
import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { SegmentedThree } from "@/components/ui/segmented-control";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { normalizeManagerSkuTier, type ManagerSkuTier } from "@/lib/manager-access";
import { useAppUi } from "@/components/providers/app-ui-provider";

type SubPayload = {
  tier: string | null;
  isPro: boolean;
  isBusiness: boolean;
  isFree: boolean;
  isLegacyUnlimited: boolean;
  /** When true, plan changes use the active billing subscription (prorated upgrades). */
  stripeManaged?: boolean;
};

/** Committed plan from server; prefer normalized `tier` so the highlight matches DB. */
function pickerValue(sub: SubPayload | null): ManagerSkuTier {
  if (!sub) return "free";
  const fromTier = normalizeManagerSkuTier(sub.tier);
  if (fromTier) return fromTier;
  if (sub.isLegacyUnlimited) return "pro";
  return "pro";
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

export function ManagerPlan() {
  const router = useRouter();
  const pathname = usePathname();
  const planReturnPath = pathname.startsWith("/owner") ? "/owner/plan" : "/manager/plan";
  const { showToast } = useAppUi();
  const [sub, setSub] = useState<SubPayload | null>(null);
  const [busy, setBusy] = useState(false);
  /** Shown immediately on segment click so the blue pill tracks the selection while the API runs. */
  const [pickerOverride, setPickerOverride] = useState<ManagerSkuTier | null>(null);

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

  const committedTier = useMemo(() => pickerValue(sub), [sub]);
  const displayTier = pickerOverride ?? committedTier;

  useEffect(() => {
    if (pickerOverride != null && pickerOverride === committedTier) {
      setPickerOverride(null);
    }
  }, [committedTier, pickerOverride]);

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
    if (tier === pickerValue(sub) && !sub.isLegacyUnlimited) return;
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
        setPickerOverride(null);
        return;
      }
      const label = tierLabel(tier);
      showToast(`Plan updated to ${label}.`);
      await load();
      startTransition(() => {
        router.refresh();
      });
    } catch {
      showToast("Network error.");
      setPickerOverride(null);
    } finally {
      setBusy(false);
    }
  };

  const applyTierChange = (tier: ManagerSkuTier) => {
    if (!sub || busy) return;
    if (tier === committedTier && !sub.isLegacyUnlimited) return;

    const from = committedTier;

    if (tier === "free" && !sub.isFree) {
      if (!window.confirm("Switch to the Free plan? Paid features may be limited after you change.")) return;
    }

    if (tierRank(tier) > tierRank(from)) {
      if (sub.stripeManaged) {
        if (
          !window.confirm(
            "Your saved payment method will be charged a prorated amount for this upgrade. Continue?",
          )
        ) {
          return;
        }
      } else if (!window.confirm(`Upgrade to ${tierLabel(tier)}?`)) {
        return;
      }
    }

    setPickerOverride(tier);
    void setTier(tier);
  };

  return (
    <ManagerPortalPageShell title="Plan">
      <div className="max-w-lg space-y-8 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
        <div className="space-y-4">
          {sub ? (
            <SegmentedThree<ManagerSkuTier>
              value={displayTier}
              onChange={applyTierChange}
              disabled={busy}
              first={{ id: "free", label: "Free" }}
              second={{ id: "pro", label: "Pro" }}
              third={{ id: "business", label: "Business" }}
            />
          ) : (
            <div className="h-[46px] animate-pulse rounded-2xl bg-slate-100" aria-hidden />
          )}
        </div>

        <div className={`flex flex-wrap gap-2 ${busy || !sub ? "pointer-events-none opacity-60" : ""}`}>
          <Button
            type="button"
            variant="primary"
            className="rounded-full"
            disabled={busy || !sub?.stripeManaged}
            title={
              sub && !sub.stripeManaged && !sub.isFree
                ? "Requires an active paid plan with billing on file."
                : undefined
            }
            onClick={() => void openBillingPortal()}
          >
            Update payment method
          </Button>
        </div>

      </div>
    </ManagerPortalPageShell>
  );
}
