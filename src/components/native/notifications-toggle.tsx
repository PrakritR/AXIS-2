"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">Push notifications</p>
        <p className="mt-1 text-sm text-muted">
          {permission === "granted"
            ? "On — rent reminders and updates arrive on this device."
            : permission === "denied"
              ? "Turn on notifications for Axis in your device Settings to enable."
              : "Get rent reminders, work-order updates, and announcements."}
        </p>
      </div>
      {permission === "granted" ? (
        <span className="shrink-0 text-sm font-semibold text-emerald-400">Enabled</span>
      ) : permission === "denied" ? null : (
        <Button variant="secondary" onClick={enable} disabled={busy} className="shrink-0">
          {busy ? "Enabling…" : "Enable"}
        </Button>
      )}
    </div>
  );
}
