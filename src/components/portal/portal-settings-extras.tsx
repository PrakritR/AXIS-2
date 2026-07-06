"use client";

import Link from "next/link";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { PortalRoleSwitcher } from "@/components/portal/portal-role-switcher";
import { PortalCollapsibleSection } from "@/components/portal/portal-collapsible-section";
import { PortalSignOutButton } from "@/components/portal/portal-sign-out-button";
import type { PortalKind } from "@/lib/portal-types";

/** Account actions on the Settings page — theme, portal switch, sign out. */
export function PortalSettingsExtras({ currentKind }: { currentKind: PortalKind }) {
  return (
    <PortalCollapsibleSection
      title="Account"
      surfaceMuted={false}
      contentClassName="space-y-4 px-4 py-4"
      toggleDataAttr="portal-settings-account-toggle"
    >
      <div className="flex items-center justify-between gap-4">
        <p className="min-w-0 text-sm font-semibold text-foreground">Appearance</p>
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
    </PortalCollapsibleSection>
  );
}
