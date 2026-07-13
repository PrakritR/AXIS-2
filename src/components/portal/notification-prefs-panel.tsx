"use client";

import { useEffect, useState } from "react";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_CATEGORIES,
  type ChannelPreference,
  type NotificationCategory,
  type NotificationPreferences,
} from "@/lib/notification-preferences";

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  messages: "Messages",
  leases: "Leases & signing",
  payments: "Rent & payments",
  maintenance: "Maintenance",
  applications: "Applications & tours",
  account: "Account & security",
};

type ChannelId = keyof ChannelPreference;

function BellIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

/**
 * Inbox toolbar button that opens the notification-preferences matrix in a modal
 * popup — placed next to "New message" so managers/residents/vendors can tune
 * channels without leaving their message list. Same data as the Notifications
 * inbox tab; edits are optimistic and demo-safe (see NotificationPrefsPanel).
 */
export function NotificationPrefsButton({
  hasVerifiedPhone = true,
  className,
}: {
  hasVerifiedPhone?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={className}
        data-attr="inbox-notification-settings"
        onClick={() => setOpen(true)}
      >
        <BellIcon className="mr-1.5 inline-block align-[-2px]" />
        Notifications
      </Button>
      <Modal
        open={open}
        title="Notification settings"
        onClose={() => setOpen(false)}
        panelClassName="max-w-2xl"
      >
        <NotificationPrefsPanel hasVerifiedPhone={hasVerifiedPhone} />
      </Modal>
    </>
  );
}

const CHANNELS: { id: ChannelId; label: string }[] = [
  { id: "inbox", label: "Axis inbox" },
  { id: "email", label: "Email" },
  { id: "sms", label: "Text (SMS)" },
];

/**
 * A cell is force-on (checked + disabled) when it is the system-of-record inbox
 * channel, or the account-safety category's SMS channel (which cannot be
 * silenced — mirrors `resolveChannels` in notification-preferences.ts).
 */
function isForcedOn(category: NotificationCategory, channel: ChannelId): boolean {
  if (channel === "inbox") return true;
  if (channel === "sms" && category === "account") return true;
  return false;
}

/**
 * Per-user notification channel matrix (categories × Axis inbox / Email / Text).
 * Reads and writes `/api/notification-preferences`; edits are optimistic and
 * roll back the touched cell if the PATCH fails.
 */
export function NotificationPrefsPanel({ hasVerifiedPhone = true }: { hasVerifiedPhone?: boolean }) {
  const { showToast } = useAppUi();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);

  useEffect(() => {
    let active = true;
    // Demo surfaces have no authenticated user (the API 401s) and must never
    // write real rows — start from defaults and keep edits local (see toggle).
    if (isDemoModeActive()) {
      setPrefs(DEFAULT_NOTIFICATION_PREFERENCES);
      return () => {
        active = false;
      };
    }
    void fetch("/api/notification-preferences", { credentials: "include" })
      .then(async (res) =>
        res.ok ? ((await res.json()) as { preferences?: NotificationPreferences }) : { preferences: undefined },
      )
      .catch(() => ({ preferences: undefined }))
      .then((data) => {
        if (active) setPrefs(data.preferences ?? DEFAULT_NOTIFICATION_PREFERENCES);
      });
    return () => {
      active = false;
    };
  }, []);

  const toggle = async (category: NotificationCategory, channel: ChannelId, next: boolean) => {
    const current = prefs;
    if (!current) return;
    // Optimistic: flip just this cell.
    setPrefs({ ...current, [category]: { ...current[category], [channel]: next } });
    // Demo mode: edits are session-local only — never hit the (unauthenticated)
    // API, so no error toast and no real writes.
    if (isDemoModeActive()) return;
    try {
      const res = await fetch("/api/notification-preferences", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: { [category]: { [channel]: next } } }),
      });
      if (!res.ok) throw new Error("save failed");
    } catch {
      showToast("Could not save the preference.");
      // Roll back only the touched cell so concurrent edits are preserved.
      setPrefs((s) =>
        s ? { ...s, [category]: { ...s[category], [channel]: current[category][channel] } } : s,
      );
    }
  };

  return (
    <div className="space-y-4">
      {prefs === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="border-b border-border px-4 py-4 sm:px-5">
            <p className="text-sm leading-6 text-muted">
              Choose how you want to be notified for each type of update. The{" "}
              <span className="font-semibold text-foreground">Axis inbox</span> always keeps a copy, and
              account &amp; security texts can&apos;t be turned off.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[26rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-muted"
                  >
                    Notification
                  </th>
                  {CHANNELS.map((ch) => (
                    <th key={ch.id} scope="col" className="px-3 py-3 text-center align-bottom">
                      <span className="block text-xs font-semibold text-foreground">{ch.label}</span>
                      {ch.id === "sms" && !hasVerifiedPhone ? (
                        <span className="mt-1 block text-[10px] font-normal leading-tight text-muted">
                          Verify your phone in Settings to receive texts
                        </span>
                      ) : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {NOTIFICATION_CATEGORIES.map((category) => (
                  <tr key={category} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3 text-left font-medium text-foreground">
                      {CATEGORY_LABELS[category]}
                    </td>
                    {CHANNELS.map((ch) => {
                      const forced = isForcedOn(category, ch.id);
                      const checked = forced ? true : prefs[category][ch.id];
                      return (
                        <td key={ch.id} className="px-3 py-3 text-center">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-border accent-primary disabled:opacity-50"
                            checked={checked}
                            disabled={forced}
                            onChange={(e) => void toggle(category, ch.id, e.target.checked)}
                            aria-label={`${ch.label} for ${CATEGORY_LABELS[category]}`}
                            data-attr={`notif-pref-${category}-${ch.id}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
