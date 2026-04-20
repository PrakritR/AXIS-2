"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ManagerSectionShell } from "@/components/portal/manager-section-shell";
import { PORTAL_PAGE_TITLE, PORTAL_SECTION_SURFACE } from "@/components/portal/portal-metrics";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { PRO_MAX_PROPERTIES } from "@/lib/manager-access";

type SubPayload = {
  tier: string | null;
  isPro: boolean;
  isBusiness: boolean;
  isFree: boolean;
  isLegacyUnlimited: boolean;
  proPropertyLimit: number;
};

export function ManagerUpgrade() {
  const router = useRouter();
  const { showToast } = useAppUi();
  const [sub, setSub] = useState<SubPayload | null>(null);

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

  const headline =
    sub?.isBusiness === true
      ? "You’re on Business"
      : sub?.isPro === true
        ? "Upgrade from Pro to Business"
        : sub?.isFree === true
          ? "Upgrade your plan"
          : sub?.isLegacyUnlimited
            ? "Subscription"
            : "Upgrade your plan";

  return (
    <ManagerSectionShell
      title="Upgrade"
      actions={[{ label: "Refresh", variant: "outline", onClick: () => void load() }]}
    >
      <div className={PORTAL_SECTION_SURFACE}>
        <h2 className={PORTAL_PAGE_TITLE}>{headline}</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Pro covers up to {PRO_MAX_PROPERTIES} houses. Business unlocks more properties and owner accounts linked to your portfolio.
        </p>

        {sub ? (
          <div className="mt-6 rounded-2xl border border-slate-200/90 bg-slate-50/60 px-4 py-3 text-sm text-slate-800">
            <p>
              <span className="font-semibold text-slate-900">Current tier:</span>{" "}
              {sub.isLegacyUnlimited
                ? "Not set (legacy / full demo access)"
                : sub.tier
                  ? sub.tier.charAt(0).toUpperCase() + sub.tier.slice(1)
                  : "—"}
            </p>
            {sub.isPro ? (
              <p className="mt-2 text-slate-700">
                You’re on <span className="font-semibold">Pro</span>. Add a third property or invite owners by moving to{" "}
                <span className="font-semibold">Business</span>.
              </p>
            ) : null}
            {sub.isBusiness ? (
              <p className="mt-2 text-emerald-800">You already have Business — no upgrade needed.</p>
            ) : null}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">Loading…</p>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <Button type="button" className="rounded-full px-6" onClick={() => router.push("/partner/pricing")}>
            View Business pricing
          </Button>
          <Button type="button" variant="outline" className="rounded-full" onClick={() => router.push("/manager/properties")}>
            Back to properties
          </Button>
        </div>

        <ul className="mt-8 list-inside list-disc space-y-2 text-sm text-slate-600">
          <li>Pro: up to {PRO_MAX_PROPERTIES} properties; no owner linking.</li>
          <li>Business: more properties and owner accounts for co-owners.</li>
        </ul>
      </div>
    </ManagerSectionShell>
  );
}
