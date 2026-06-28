"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { portalDashboardPath, type AuthRole } from "@/components/auth/portal-switcher";
import { portalSwitchTargets, type PortalSwitchTarget } from "@/lib/portal-switch-targets";
import type { PortalKind } from "@/lib/portal-types";

export function PortalRoleSwitcher({ currentKind }: { currentKind: PortalKind }) {
  const router = useRouter();
  const [targets, setTargets] = useState<PortalSwitchTarget[]>([]);
  const [busyRole, setBusyRole] = useState<AuthRole | null>(null);

  useEffect(() => {
    void fetch("/api/auth/portal-roles")
      .then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json()) as { roles?: AuthRole[] };
        const roles = body.roles ?? [];
        setTargets(portalSwitchTargets(currentKind, roles));
      })
      .catch(() => {});
  }, [currentKind]);

  if (!targets.length) return null;

  const switchPortal = async (role: AuthRole) => {
    setBusyRole(role);
    try {
      const res = await fetch("/api/auth/set-active-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) return;
      router.push(portalDashboardPath(role));
      router.refresh();
    } catch {
      /* ignore */
    } finally {
      setBusyRole(null);
    }
  };

  return (
    <>
      {targets.map((target) => (
        <button
          key={target.role}
          type="button"
          onClick={() => void switchPortal(target.role)}
          disabled={busyRole !== null}
          className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm font-medium text-muted transition hover:bg-card hover:text-foreground disabled:opacity-50"
        >
          <span className="text-base leading-none" aria-hidden>
            ⇄
          </span>
          {busyRole === target.role ? "Switching…" : target.label}
        </button>
      ))}
    </>
  );
}
