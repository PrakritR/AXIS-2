"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PortalSegmentedControl } from "@/components/portal/portal-metrics";
import { useAppUi } from "@/components/providers/app-ui-provider";

type Mode = "owner" | "manager";

/**
 * Toggle between owner portal (listings / property creation on Free) and manager portal (paid tiers).
 * Free tier (`manager_purchases.tier === 'free'`) stays on owner tools only — manager arm is disabled until upgrade.
 */
export function OwnerManagerAccountSwitch() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { showToast } = useAppUi();
  const [isFreeTier, setIsFreeTier] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/manager/subscription", { credentials: "include" });
        const body = (await res.json()) as { isFree?: boolean; error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setIsFreeTier(false);
          return;
        }
        setIsFreeTier(Boolean(body.isFree));
      } catch {
        if (!cancelled) setIsFreeTier(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const mode: Mode = pathname.startsWith("/owner") ? "owner" : "manager";

  /** Block navigating to manager while Free; block until subscription is known (fail-safe). */
  const managerPortalBlocked = useMemo(() => {
    if (isFreeTier === null) return true;
    return isFreeTier === true;
  }, [isFreeTier]);

  const managerOptionDisabled = mode === "owner" && managerPortalBlocked;

  return (
    <div
      className="flex max-w-full flex-col gap-1 sm:items-end"
      title={
        managerOptionDisabled
          ? "Upgrade to Pro or Business on Plan to open the manager portal."
          : undefined
      }
    >
      <PortalSegmentedControl<Mode>
        size="sm"
        options={[
          { id: "owner", label: "Owner account" },
          { id: "manager", label: "Manager account" },
        ]}
        value={mode}
        optionDisabled={(id) => id === "manager" && managerOptionDisabled}
        onChange={(id) => {
          if (id === "owner") {
            router.push("/owner/dashboard");
            return;
          }
          if (managerPortalBlocked) {
            showToast("Upgrade to Pro or Business on Plan to use the manager portal.");
            return;
          }
          router.push("/manager/dashboard");
        }}
      />
      {managerOptionDisabled ? (
        <p className="max-w-[240px] text-right text-[10px] leading-snug text-slate-500">
          Free plan uses owner tools to add properties. Paid plans unlock the manager portal.
        </p>
      ) : null}
    </div>
  );
}
