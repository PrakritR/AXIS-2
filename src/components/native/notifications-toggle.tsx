"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  PortalSettingsGroup,
  PortalSettingsRow,
  PortalSettingsSection,
} from "@/components/portal/portal-settings-ui";
import { getPushPermission, requestPushPermission, type PushPermission } from "@/lib/native/push-client";

/**
 * Opt-in control for push notifications, shown only inside the native app
 * (renders nothing on the web, where this flow is unsupported). The permission
 * prompt fires from an explicit tap — the recommended pattern for App Store
 * review and good UX, rather than prompting on launch.
 */
export function NotificationsToggle() {
  const [permission, setPermission] = useState<PushPermission | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void getPushPermission()
      .then((p) => {
        if (active) setPermission(p);
      })
      .catch(() => {
        if (active) setPermission("unsupported");
      });
    return () => {
      active = false;
    };
  }, []);

  if (permission === null || permission === "unsupported") return null;

  async function enable() {
    setBusy(true);
    try {
      setPermission(await requestPushPermission());
    } finally {
      setBusy(false);
    }
  }

  const description =
    permission === "granted"
      ? "Rent reminders and updates arrive on this device."
      : permission === "denied"
        ? "Turn on notifications for PropLane in your device Settings."
        : "Get rent reminders, work-order updates, and announcements.";

  return (
    <PortalSettingsSection title="Notifications" description="Manage push alerts on this device.">
      <PortalSettingsGroup>
        <PortalSettingsRow label="Push notifications" description={description}>
          {permission === "granted" ? (
            <span className="text-sm font-medium text-emerald-600">On</span>
          ) : permission === "denied" ? (
            <span className="text-sm text-muted">Blocked</span>
          ) : (
            <Button variant="secondary" className="h-9 min-h-0 px-4 text-[13px]" onClick={enable} disabled={busy}>
              {busy ? "Enabling…" : "Enable"}
            </Button>
          )}
        </PortalSettingsRow>
      </PortalSettingsGroup>
    </PortalSettingsSection>
  );
}
