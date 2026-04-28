"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { AuthRole } from "@/components/auth/portal-switcher";
import { portalDashboardPath } from "@/components/auth/portal-switcher";
import type { PortalKind } from "@/lib/portal-types";

export function PortalRoleSwitcher({ currentKind }: { currentKind: PortalKind }) {
  const router = useRouter();
  const [otherRole, setOtherRole] = useState<AuthRole | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/auth/portal-roles")
      .then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json()) as { roles?: AuthRole[] };
        const roles = body.roles ?? [];
        if ((currentKind === "manager" || currentKind === "owner" || currentKind === "pro") && roles.includes("resident")) {
          setOtherRole("resident");
        } else if (currentKind === "resident") {
          if (roles.includes("manager")) setOtherRole("manager");
          else if (roles.includes("owner")) setOtherRole("owner");
        }
      })
      .catch(() => {});
  }, [currentKind]);

  if (!otherRole) return null;

  const label = otherRole === "resident" ? "Switch to Resident portal" : "Switch to Manager portal";

  const switchPortal = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/auth/set-active-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: otherRole }),
      });
      if (!res.ok) return;
      router.push(portalDashboardPath(otherRole));
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void switchPortal()}
      disabled={busy}
      className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm font-medium text-slate-500 transition hover:bg-white hover:text-slate-800 disabled:opacity-50"
    >
      <span className="text-base leading-none" aria-hidden>⇄</span>
      {busy ? "Switching…" : label}
    </button>
  );
}
