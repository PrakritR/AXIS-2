"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { GmailPaymentTrackRole } from "@/lib/gmail-payments/portal-role";

export type GmailPaymentTrackStatus = {
  connected: boolean;
  email: string | null;
  configured: boolean;
  lastSyncAt: string | null;
  lastSyncMarkedPaid: number | null;
};

export function useGmailPaymentTrack({
  role,
  demo,
  showToast,
}: {
  role: GmailPaymentTrackRole;
  demo: boolean;
  showToast: (message: string) => void;
}) {
  const apiBase = role === "vendor" ? "/api/vendor/gmail-payments" : "/api/portal/gmail-payments";
  const connectPath =
    role === "vendor"
      ? `/api/vendor/gmail-payments/connect?origin=${encodeURIComponent(typeof window !== "undefined" ? window.location.origin : "")}`
      : `/api/portal/gmail-payments/connect?origin=${encodeURIComponent(typeof window !== "undefined" ? window.location.origin : "")}`;

  const [gmailStatus, setGmailStatus] = useState<GmailPaymentTrackStatus | null>(null);
  const [gmailBusy, setGmailBusy] = useState(false);
  const [gmailSyncBusy, setGmailSyncBusy] = useState(false);

  const loadGmailStatus = useCallback(async () => {
    if (demo) {
      setGmailStatus({ connected: false, email: null, configured: true, lastSyncAt: null, lastSyncMarkedPaid: null });
      return;
    }
    try {
      const res = await fetch(apiBase, { credentials: "include" });
      const data = (await res.json().catch(() => ({}))) as { status?: GmailPaymentTrackStatus };
      if (res.ok && data.status) setGmailStatus(data.status);
    } catch {
      setGmailStatus(null);
    }
  }, [apiBase, demo]);

  useEffect(() => {
    void loadGmailStatus();
  }, [loadGmailStatus]);

  function linkGmail() {
    if (demo) {
      showToast("Gmail connect is disabled in demo mode.");
      return;
    }
    setGmailBusy(true);
    window.location.assign(connectPath);
  }

  async function syncGmail() {
    if (demo) return;
    setGmailSyncBusy(true);
    try {
      const res = await fetch(`${apiBase}/sync`, { method: "POST", credentials: "include" });
      const data = (await res.json().catch(() => ({}))) as {
        result?: { scanned: number; markedPaid: number };
        error?: string;
      };
      if (!res.ok) {
        showToast(data.error ?? "Gmail sync failed.");
        return;
      }
      const r = data.result;
      showToast(
        r
          ? `Synced ${r.scanned} receipt${r.scanned === 1 ? "" : "s"}; ${r.markedPaid} marked paid.`
          : "Gmail sync complete.",
      );
      void loadGmailStatus();
    } catch {
      showToast("Gmail sync failed.");
    } finally {
      setGmailSyncBusy(false);
    }
  }

  return {
    gmailStatus,
    gmailBusy,
    gmailSyncBusy,
    linkGmail,
    syncGmail,
    loadGmailStatus,
  };
}

type ManualChannel = "zelle" | "venmo";

const CHANNEL_FILTER_FROM: Record<ManualChannel, string> = {
  zelle: "zellepay.com",
  venmo: "venmo.com",
};

export function GmailPaymentTrackSteps({
  role,
  channel,
  paymentInboxAddress,
  autoMarkEnabled,
  onAutoMarkChange,
  gmailStatus,
  gmailBusy,
  gmailSyncBusy,
  onLinkGmail,
  onSyncGmail,
  showToast,
  compact,
}: {
  role: GmailPaymentTrackRole;
  channel?: ManualChannel;
  paymentInboxAddress?: string;
  autoMarkEnabled: boolean;
  onAutoMarkChange: (enabled: boolean) => void | Promise<void>;
  gmailStatus: GmailPaymentTrackStatus | null;
  gmailBusy: boolean;
  gmailSyncBusy: boolean;
  onLinkGmail: () => void;
  onSyncGmail: () => void;
  showToast: (message: string) => void;
  compact?: boolean;
}) {
  const refLabel = role === "manager" ? "PL-" : "WO-";
  const filterFrom = channel ? CHANNEL_FILTER_FROM[channel] : "venmo.com OR zellepay.com";
  const channelLabel = channel === "zelle" ? "Zelle" : channel === "venmo" ? "Venmo" : "Zelle/Venmo";

  return (
    <ol className={`list-decimal space-y-3 pl-5 text-xs leading-relaxed text-muted ${compact ? "mt-3" : ""}`}>
      <li className="text-foreground">
        <span className="font-medium text-foreground">Link Gmail</span>
        <span className="text-muted"> — we read {channelLabel} notification emails and match the </span>
        <span className="font-mono">{refLabel}</span>
        <span className="text-muted"> code and amount.</span>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {gmailStatus?.connected ? (
            <span className="text-sm font-medium text-[var(--status-confirmed-fg)]">
              {gmailStatus.email ?? "Connected"}
            </span>
          ) : (
            <button
              type="button"
              onClick={onLinkGmail}
              disabled={gmailBusy || gmailStatus?.configured === false}
              data-attr={channel ? `manager-payment-${channel}-gmail-link` : `${role}-payment-gmail-link`}
              className="text-sm font-medium text-primary hover:underline disabled:opacity-50"
            >
              {gmailBusy ? "Opening…" : "Link Gmail"}
            </button>
          )}
          {gmailStatus?.connected ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 rounded-full px-3 text-xs"
              disabled={gmailSyncBusy}
              data-attr={channel ? `manager-payment-${channel}-gmail-sync` : `${role}-payment-gmail-sync`}
              onClick={onSyncGmail}
            >
              {gmailSyncBusy ? "Syncing…" : "Sync now"}
            </Button>
          ) : null}
        </div>
        {gmailStatus?.configured === false ? (
          <p className="mt-1 text-muted">Google sign-in is not configured on this server.</p>
        ) : null}
        {gmailStatus?.connected && gmailStatus.lastSyncAt ? (
          <p className="mt-1 text-muted">Last sync {new Date(gmailStatus.lastSyncAt).toLocaleString()}</p>
        ) : null}
      </li>

      {paymentInboxAddress && role === "manager" ? (
        <li className="text-foreground">
          <span className="font-medium text-foreground">Set up a Gmail filter</span>
          <span className="text-muted"> (optional if Gmail is linked above)</span>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>Open Gmail → Settings → Filters → Create filter.</li>
            <li>
              From: <span className="font-mono">{filterFrom}</span>
            </li>
            <li>
              Choose “Forward it to” and add{" "}
              <code className="break-all rounded bg-card px-1 py-0.5 text-[11px] text-foreground">
                {paymentInboxAddress}
              </code>{" "}
              <button
                type="button"
                onClick={() =>
                  void navigator.clipboard?.writeText(paymentInboxAddress).then(() => showToast("Copied."))
                }
                className="font-medium text-primary hover:underline"
              >
                Copy
              </button>
            </li>
            <li>Save the filter. New {channelLabel} emails will auto-mark matching charges.</li>
          </ul>
        </li>
      ) : null}

      {role === "manager" ? (
        <li className="text-foreground">
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={autoMarkEnabled}
              onChange={(e) => void onAutoMarkChange(e.target.checked)}
              data-attr={channel ? `manager-payment-${channel}-auto-mark` : "manager-payment-auto-mark-toggle"}
            />
            <span>
              <span className="font-medium text-foreground">Automatically mark matching charges paid</span>
              <span className="block text-muted">Turn this on so {channelLabel} receipts mark the right charge without a manual review.</span>
            </span>
          </label>
        </li>
      ) : null}
    </ol>
  );
}

export function GmailPaymentAutoTrackPanel({
  role,
  demo,
  paymentInboxAddress,
  autoMarkEnabled,
  onAutoMarkChange,
  showToast,
}: {
  role: GmailPaymentTrackRole;
  demo: boolean;
  paymentInboxAddress?: string;
  autoMarkEnabled: boolean;
  onAutoMarkChange: (enabled: boolean) => void | Promise<void>;
  showToast: (message: string) => void;
}) {
  const { gmailStatus, gmailBusy, gmailSyncBusy, linkGmail, syncGmail } = useGmailPaymentTrack({
    role,
    demo,
    showToast,
  });

  const roleHint =
    role === "manager"
      ? "incoming Zelle/Venmo from residents"
      : "incoming Zelle/Venmo payouts from your manager";

  return (
    <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">Auto-track receipts</p>
      <p className="text-sm text-foreground">
        Link Gmail to read {roleHint}. We match the{" "}
        <span className="font-mono">{role === "manager" ? "PL-" : "WO-"}</span> code and amount, then mark{" "}
        {role === "manager" ? "the charge" : "the work order"} paid.
      </p>
      <div className="rounded-xl border border-border bg-card px-4 py-3">
        <GmailPaymentTrackSteps
          role={role}
          paymentInboxAddress={paymentInboxAddress}
          autoMarkEnabled={autoMarkEnabled}
          onAutoMarkChange={onAutoMarkChange}
          gmailStatus={gmailStatus}
          gmailBusy={gmailBusy}
          gmailSyncBusy={gmailSyncBusy}
          onLinkGmail={linkGmail}
          onSyncGmail={() => void syncGmail()}
          showToast={showToast}
        />
      </div>
    </div>
  );
}
