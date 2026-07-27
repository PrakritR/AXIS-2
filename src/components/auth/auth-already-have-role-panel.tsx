"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { portalDashboardPath } from "@/components/auth/portal-switcher";

const ROLE_LABEL: Record<"manager" | "resident" | "vendor", string> = {
  manager: "property manager",
  resident: "resident",
  vendor: "vendor",
};

/**
 * Signed-in-and-already-hold-this-role state for the create-account tabs. It
 * replaces the signup form with a clear way in — the mirror-image fix for
 * "offering someone a signup form for access they already have." Optionally
 * exposes a secondary "create a different account" affordance so no capability
 * is lost (manager/vendor can still spin up a separate account); resident is
 * additive and never needs it.
 */
export function AuthAlreadyHaveRolePanel({
  role,
  email,
  onCreateAnother,
  createAnotherLabel,
}: {
  role: "manager" | "resident" | "vendor";
  email: string | null;
  onCreateAnother?: () => void;
  createAnotherLabel?: string;
}) {
  const label = ROLE_LABEL[role];
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border bg-card/50 px-3 py-3 text-center text-[13px] leading-snug text-muted">
        You&apos;re signed in
        {email ? (
          <>
            {" "}
            as <span className="font-semibold text-foreground">{email}</span>
          </>
        ) : null}{" "}
        and already have {label} access.
      </div>
      <Button
        asChild
        className="btn-cobalt w-full rounded-full py-2.5 text-[15px] font-semibold"
        data-attr={`auth-${role}-go-to-portal`}
      >
        <Link href={`/auth/continue?next=${encodeURIComponent(portalDashboardPath(role))}`}>Go to your portal</Link>
      </Button>
      {onCreateAnother ? (
        <button
          type="button"
          data-attr={`auth-${role}-create-another`}
          className="w-full text-center text-[12px] font-semibold text-primary hover:opacity-90"
          onClick={onCreateAnother}
        >
          {createAnotherLabel ?? "Create a different account"}
        </button>
      ) : null}
    </div>
  );
}
