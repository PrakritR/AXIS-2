"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ManagerSectionShell } from "@/components/portal/manager-section-shell";
import { PORTAL_SECTION_SURFACE } from "@/components/portal/portal-metrics";
import { useAppUi } from "@/components/providers/app-ui-provider";

type SubPayload = {
  tier: string | null;
  isPro: boolean;
  isBusiness: boolean;
  isFree: boolean;
  isLegacyUnlimited: boolean;
  proPropertyLimit: number;
};

function tierLabel(sub: SubPayload | null): string {
  if (!sub) return "…";
  if (sub.isBusiness) return "Business";
  if (sub.isPro) return "Pro";
  if (sub.isFree) return "Free";
  if (sub.isLegacyUnlimited) return "Full access";
  return sub.tier ? sub.tier.charAt(0).toUpperCase() + sub.tier.slice(1) : "—";
}

export function ManagerUpgrade() {
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

  const instantUpgrade = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/manager/subscription", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "upgrade_business" }),
      });
      const body = (await res.json()) as SubPayload & { ok?: boolean; alreadyBusiness?: boolean; error?: string };
      if (!res.ok) {
        showToast(body.error ?? "Upgrade failed.");
        return;
      }
      setSub({
        tier: body.tier ?? null,
        isPro: body.isPro ?? false,
        isBusiness: body.isBusiness ?? false,
        isFree: body.isFree ?? false,
        isLegacyUnlimited: body.isLegacyUnlimited ?? false,
        proPropertyLimit: body.proPropertyLimit ?? 2,
      });
      if (body.alreadyBusiness) {
        showToast("Already on Business.");
      } else {
        showToast("You’re on Business. Your account is updated.");
      }
      router.refresh();
    } catch {
      showToast("Network error.");
    } finally {
      setBusy(false);
    }
  };

  const showUpgradeCta = sub && !sub.isBusiness;

  return (
    <ManagerSectionShell
      title="Upgrade"
      actions={[{ label: "Refresh", variant: "outline", onClick: () => void load() }]}
    >
      <div className={PORTAL_SECTION_SURFACE}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current plan</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{tierLabel(sub)}</p>
          </div>
          {showUpgradeCta ? (
            <Button
              type="button"
              className="rounded-full px-8"
              disabled={busy}
              onClick={() => void instantUpgrade()}
            >
              {busy ? "Updating…" : "Upgrade to Business"}
            </Button>
          ) : sub?.isBusiness ? (
            <p className="text-sm font-medium text-emerald-800">You have the top plan.</p>
          ) : null}
        </div>

        {showUpgradeCta ? (
          <p className="mt-6 text-sm text-slate-500">
            Applies to this signed-in account immediately.{" "}
            <Link href="/partner/pricing" className="font-medium text-primary underline underline-offset-2">
              Compare plans
            </Link>
          </p>
        ) : null}

        {!sub ? <p className="mt-4 text-sm text-slate-500">Loading…</p> : null}
      </div>
    </ManagerSectionShell>
  );
}
