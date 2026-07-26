"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type PortalRole = "manager" | "resident" | "vendor" | "admin";

const ROLE_LABEL: Record<"manager" | "resident" | "vendor", string> = {
  manager: "property manager",
  resident: "resident",
  vendor: "vendor",
};

/** Context banner when a signed-in user is adding another portal type on create-account. */
export function AuthSignedInRoleBanner({
  role,
  email,
}: {
  role: "manager" | "resident" | "vendor";
  email: string | null;
}) {
  const [roles, setRoles] = useState<PortalRole[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/auth/portal-roles", { credentials: "include" });
        const body = (await res.json()) as { roles?: PortalRole[] };
        if (!cancelled && res.ok) {
          setRoles(Array.isArray(body.roles) ? body.roles : []);
        }
      } catch {
        if (!cancelled) setRoles([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!email?.trim()) return null;

  const label = ROLE_LABEL[role];
  const hasRole = roles?.includes(role) === true;

  return (
    <div className="rounded-2xl border border-border bg-card/50 px-3 py-2 text-center text-[12px] leading-snug text-muted">
      {hasRole ? (
        <>
          You&apos;re signed in as <span className="font-semibold text-foreground">{email}</span> and already have{" "}
          {label} access.{" "}
          <Link href="/auth/continue" className="font-semibold text-primary hover:opacity-90">
            Go to your portal
          </Link>
          .
        </>
      ) : (
        <>
          You&apos;re signed in as <span className="font-semibold text-foreground">{email}</span>. Add {label} access
          below, or{" "}
          <Link href="/auth/continue" className="font-semibold text-primary hover:opacity-90">
            continue to your portal
          </Link>
          .
        </>
      )}
    </div>
  );
}
