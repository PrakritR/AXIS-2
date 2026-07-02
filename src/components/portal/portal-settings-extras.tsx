"use client";

import Link from "next/link";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { PortalRoleSwitcher } from "@/components/portal/portal-role-switcher";
import { PortalSignOutButton } from "@/components/portal/portal-sign-out-button";
import type { PortalKind } from "@/lib/portal-types";

/** Account actions on the Settings page — theme, portal switch, sign out. */
export function PortalSettingsExtras({ currentKind }: { currentKind: PortalKind }) {
  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)] sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Appearance</p>
          <p className="text-xs text-muted">Light or dark mode</p>
        </div>
        <ThemeToggle className="shrink-0" />
      </div>

      <div className="border-t border-border pt-4">
        <PortalRoleSwitcher currentKind={currentKind} />
      </div>

      {currentKind === "admin" ? (
        <Link
          href="/contact"
          className="block w-full rounded-full border border-border px-4 py-3 text-center text-sm font-semibold text-foreground transition hover:bg-accent/70"
        >
          Contact us
        </Link>
      ) : null}

      <PortalSignOutButton className="w-full rounded-full border border-border px-4 py-3 text-center text-sm font-semibold text-foreground transition hover:bg-accent/70 disabled:opacity-60" />
    </div>
  );
}
