"use client";

import { useCallback, useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import { openStripeConnectOnboarding } from "@/lib/stripe-connect-onboarding-client";
import {
  DEFAULT_MANAGER_MANUAL_PAYMENT_SETTINGS,
  MANAGER_MANUAL_PAYMENT_SETTINGS_EVENT,
  type ManagerManualPaymentSettingsView,
} from "@/lib/manager-manual-payment-settings";

const ZELLE_URL = "https://www.zellepay.com/";
const VENMO_URL = "https://account.venmo.com/";
const DEMO_INBOX = "payments+demo-token@prop-lane.space";

function draftFromSettings(settings: ManagerManualPaymentSettingsView | null): ManagerManualPaymentSettingsView {
  return settings ?? { ...DEFAULT_MANAGER_MANUAL_PAYMENT_SETTINGS, paymentInboxAddress: DEMO_INBOX };
}

function HubRow({
  label,
  connected,
  onLink,
  dataAttr,
  busy,
}: {
  label: string;
  connected: boolean;
  onLink: () => void;
  dataAttr: string;
  busy?: boolean;
}) {
  return (
    <div className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3.5">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      {connected ? (
        <span className="text-sm font-medium text-[var(--status-confirmed-fg)]">Connected</span>
      ) : (
        <button
          type="button"
          onClick={onLink}
          disabled={busy}
          data-attr={dataAttr}
          className="text-sm font-medium text-primary hover:underline disabled:opacity-50"
        >
          {busy ? "Opening…" : "Link"}
        </button>
      )}
    </div>
  );
}

function ManualChannelSetup({
  label,
  placeholder,
  value,
  connected,
  saving,
  onChange,
  onSave,
  onOpenProvider,
  linkDataAttr,
  saveDataAttr,
}: {
  label: string;
  placeholder: string;
  value: string;
  connected: boolean;
  saving: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
  onOpenProvider: () => void;
  linkDataAttr: string;
  saveDataAttr: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3.5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        {connected ? (
          <span className="text-sm font-medium text-[var(--status-confirmed-fg)]">Connected</span>
        ) : (
          <button
            type="button"
            onClick={onOpenProvider}
            data-attr={linkDataAttr}
            className="text-sm font-medium text-primary hover:underline"
          >
            Open {label}
          </button>
        )}
      </div>
      <p className="text-xs leading-relaxed text-muted">
        Residents pay you here. Save your {label} contact so charges show the right pay-to info.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1"
          data-attr={`${saveDataAttr}-input`}
        />
        <Button
          type="button"
          variant="outline"
          className="shrink-0 rounded-full"
          disabled={saving || !value.trim()}
          data-attr={saveDataAttr}
          onClick={onSave}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

export function ManagerPaymentSetupModal({
  open,
  onClose,
  portalBase: _portalBase,
}: {
  open: boolean;
  onClose: () => void;
  portalBase: string;
}) {
  const { showToast } = useAppUi();
  const demo = isDemoModeActive();
  const [draft, setDraft] = useState<ManagerManualPaymentSettingsView>(() => draftFromSettings(null));
  const [loading, setLoading] = useState(false);
  const [stripeBusy, setStripeBusy] = useState(false);
  const [stripeReady, setStripeReady] = useState(false);
  const [savingChannel, setSavingChannel] = useState<"zelle" | "venmo" | null>(null);

  const loadStripeStatus = useCallback(async () => {
    if (demo) {
      setStripeReady(true);
      return;
    }
    try {
      const res = await fetch("/api/stripe/connect/status", { credentials: "include" });
      const body = (await res.json()) as {
        payoutsEnabled?: boolean;
        chargesEnabled?: boolean;
        paymentReady?: boolean;
      };
      if (!res.ok) {
        setStripeReady(false);
        return;
      }
      setStripeReady(Boolean(body.paymentReady ?? (body.payoutsEnabled && body.chargesEnabled)));
    } catch {
      setStripeReady(false);
    }
  }, [demo]);

  const loadSettings = useCallback(async () => {
    if (demo) {
      setDraft(draftFromSettings({ ...DEFAULT_MANAGER_MANUAL_PAYMENT_SETTINGS, paymentInboxAddress: DEMO_INBOX }));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/portal/manager-manual-payment-settings", { credentials: "include" });
      const data = (await res.json().catch(() => ({}))) as {
        settings?: ManagerManualPaymentSettingsView;
        error?: string;
      };
      if (!res.ok) {
        showToast(data.error ?? "Could not load payment setup.");
        return;
      }
      setDraft(draftFromSettings(data.settings ?? null));
    } catch {
      showToast("Could not load payment setup.");
    } finally {
      setLoading(false);
    }
  }, [demo, showToast]);

  useEffect(() => {
    if (!open) return;
    void loadStripeStatus();
    void loadSettings();
  }, [open, loadStripeStatus, loadSettings]);

  useEffect(() => {
    if (!open) return;
    const onFocus = () => void loadStripeStatus();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [open, loadStripeStatus]);

  async function persistSettings(
    patch: Partial<ManagerManualPaymentSettingsView>,
    channel: "zelle" | "venmo" | null = null,
  ) {
    if (demo) {
      setDraft((prev) => draftFromSettings({ ...prev, ...patch }));
      showToast("Saved (demo).");
      return;
    }
    if (channel) setSavingChannel(channel);
    try {
      const res = await fetch("/api/portal/manager-manual-payment-settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, ...patch, applyToAllListings: true, receiptAutoMarkEnabled: true }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        settings?: ManagerManualPaymentSettingsView;
        error?: string;
        chargesUpdated?: number;
      };
      if (!res.ok) {
        showToast(data.error ?? "Could not save payment setup.");
        return;
      }
      if (data.settings) {
        setDraft(draftFromSettings(data.settings));
        window.dispatchEvent(new CustomEvent(MANAGER_MANUAL_PAYMENT_SETTINGS_EVENT));
      }
      const chargeNote =
        typeof data.chargesUpdated === "number" && data.chargesUpdated > 0
          ? ` Updated ${data.chargesUpdated} open charge${data.chargesUpdated === 1 ? "" : "s"}.`
          : "";
      showToast(`Payment setup saved.${chargeNote}`);
    } catch {
      showToast("Could not save payment setup.");
    } finally {
      setSavingChannel(null);
    }
  }

  function openExternal(url: string) {
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) showToast("Allow pop-ups to open the link.");
  }

  async function linkStripe() {
    setStripeBusy(true);
    try {
      await openStripeConnectOnboarding({ showToast });
    } finally {
      setStripeBusy(false);
    }
  }

  function copyInboxAddress() {
    const address = draft.paymentInboxAddress?.trim();
    if (!address) return;
    void navigator.clipboard?.writeText(address).then(() => {
      showToast("Forwarding address copied.");
    });
  }

  const zelleConnected = draft.zellePaymentsEnabled && draft.zelleContact.trim().length > 0;
  const venmoConnected = draft.venmoPaymentsEnabled && draft.venmoContact.trim().length > 0;

  return (
    <Modal open={open} title="Link payment" onClose={onClose}>
      <div className="space-y-3">
        {loading ? <p className="text-sm text-muted">Loading…</p> : null}
        {draft.paymentInboxAddress ? (
          <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Auto-track receipts</p>
            <p className="mt-1 text-sm text-foreground">
              Forward Zelle and Venmo receipt emails here. We match the <span className="font-mono">PL-</span> code
              and amount, then mark the charge paid.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="break-all rounded-md bg-card px-2 py-1 text-xs text-foreground">
                {draft.paymentInboxAddress}
              </code>
              <button
                type="button"
                onClick={copyInboxAddress}
                data-attr="manager-payment-inbox-copy"
                className="text-sm font-medium text-primary hover:underline"
              >
                Copy
              </button>
            </div>
          </div>
        ) : null}
        <HubRow
          label="Stripe link"
          connected={stripeReady}
          onLink={() => void linkStripe()}
          dataAttr="manager-payment-stripe-link"
          busy={stripeBusy}
        />
        <ManualChannelSetup
          label="Zelle"
          placeholder="email or phone"
          value={draft.zelleContact}
          connected={zelleConnected}
          saving={savingChannel === "zelle"}
          onChange={(zelleContact) => setDraft((prev) => ({ ...prev, zelleContact }))}
          onSave={() =>
            void persistSettings(
              { zelleContact: draft.zelleContact.trim(), zellePaymentsEnabled: draft.zelleContact.trim().length > 0 },
              "zelle",
            )
          }
          onOpenProvider={() => openExternal(ZELLE_URL)}
          linkDataAttr="manager-payment-zelle-link"
          saveDataAttr="manager-payment-zelle-save"
        />
        <ManualChannelSetup
          label="Venmo"
          placeholder="@username or phone"
          value={draft.venmoContact}
          connected={venmoConnected}
          saving={savingChannel === "venmo"}
          onChange={(venmoContact) => setDraft((prev) => ({ ...prev, venmoContact }))}
          onSave={() =>
            void persistSettings(
              { venmoContact: draft.venmoContact.trim(), venmoPaymentsEnabled: draft.venmoContact.trim().length > 0 },
              "venmo",
            )
          }
          onOpenProvider={() => openExternal(VENMO_URL)}
          linkDataAttr="manager-payment-venmo-link"
          saveDataAttr="manager-payment-venmo-save"
        />
      </div>
    </Modal>
  );
}
