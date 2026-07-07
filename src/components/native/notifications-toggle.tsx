"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PortalCollapsibleSection } from "@/components/portal/portal-collapsible-section";
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

  // Only meaningful inside the native app.
  if (permission === null || permission === "unsupported") return null;

  async function enable() {
    setBusy(true);
    try {
      setPermission(await requestPushPermission());
    } finally {
      setBusy(false);
    }
  }

  return (
    <PortalCollapsibleSection
      title="Push notifications"
      subtitle={
        permission === "granted"
          ? "On — rent reminders and updates arrive on this device."
          : permission === "denied"
            ? "Turn on notifications for Axis in your device Settings to enable."
            : "Get rent reminders, work-order updates, and announcements."
      }
      surfaceMuted={false}
      contentClassName="px-4 pb-4"
      toggleDataAttr="portal-notifications-toggle"
      headerActions={
        permission === "granted" ? (
          <span className="shrink-0 text-sm font-semibold text-emerald-400">Enabled</span>
        ) : permission === "denied" ? null : (
          <Button variant="secondary" onClick={enable} disabled={busy} className="h-8 shrink-0 rounded-full px-3 text-xs">
            {busy ? "Enabling…" : "Enable"}
          </Button>
        )
      }
    >
      <p className="text-sm text-muted">
        {permission === "granted"
          ? "Notifications are enabled for this device."
          : permission === "denied"
            ? "Open your device Settings to allow notifications from Axis."
            : "Tap Enable to allow push notifications on this device."}
      </p>
    </PortalCollapsibleSection>
  );
}
