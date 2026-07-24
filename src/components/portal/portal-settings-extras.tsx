"use client";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { PortalRoleSwitcher } from "@/components/portal/portal-role-switcher";
import { PortalDeleteAccountButton } from "@/components/portal/portal-delete-account-button";
import { PortalSignOutButton } from "@/components/portal/portal-sign-out-button";
import {
  PortalSettingsGroup,
  PortalSettingsRow,
  PortalSettingsSection,
} from "@/components/portal/portal-settings-ui";
import type { PortalKind } from "@/lib/portal-types";

/** Account actions on the Settings page — theme, portal switch, sign out. */
export function PortalSettingsExtras({ currentKind }: { currentKind: PortalKind }) {
  return (
    <PortalSettingsSection title="Account" description="Appearance, workspace access, and session.">
      <PortalSettingsGroup>
        <PortalSettingsRow label="Appearance" description="Choose light or dark mode.">
          <ThemeToggle className="shrink-0" />
        </PortalSettingsRow>

        <div className="border-b border-border px-4 py-3.5 last:border-0">
          <PortalRoleSwitcher currentKind={currentKind} />
        </div>

        <div className="border-b border-border px-4 py-3.5 last:border-0">
          <PortalSignOutButton className="text-sm font-medium text-foreground underline-offset-2 transition hover:underline disabled:opacity-60" />
        </div>

        <div className="px-4 py-3.5">
          <PortalDeleteAccountButton className="text-sm font-medium text-danger underline-offset-2 transition hover:underline" />
        </div>
      </PortalSettingsGroup>
    </PortalSettingsSection>
  );
}
