"use client";

import { useCallback, useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PortalStripeConnectPanel } from "@/components/portal/portal-stripe-connect-panel";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import { sanitizePaymentContactInput } from "@/lib/listing-form-inputs";
import {
  DEFAULT_MANAGER_MANUAL_PAYMENT_SETTINGS,
  MANAGER_MANUAL_PAYMENT_SETTINGS_EVENT,
  type ManagerManualPaymentSettings,
} from "@/lib/manager-manual-payment-settings";

type Draft = ManagerManualPaymentSettings & { applyToAllListings: boolean };
type Pane = "hub" | "stripe" | "zelle" | "venmo";

function draftFromSettings(settings: ManagerManualPaymentSettings | null, applyToAll: boolean): Draft {
  return {
    ...(settings ?? DEFAULT_MANAGER_MANUAL_PAYMENT_SETTINGS),
    applyToAllListings: applyToAll,
  };
}

function methodAction(connected: boolean): string {
  return connected ? "Connected" : "Link";
}

function HubRow({
  label,
  connected,
  onClick,
  dataAttr,
}: {
  label: string;
  connected: boolean;
  onClick: () => void;
  dataAttr: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-attr={dataAttr}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3.5 text-left transition hover:border-primary/30 hover:bg-accent/20"
    >
      <span className="text-sm font-semibold text-foreground">{label}</span>
      <span
        className={`text-sm font-medium ${connected ? "text-[var(--status-confirmed-fg)]" : "text-primary"}`}
      >
        {methodAction(connected)}
      </span>
    </button>
  );
}

export function ManagerPaymentSetupModal({
  open,
  onClose,
  portalBase,
}: {
  open: boolean;
  onClose: () => void;
  portalBase: string;
}) {
  const { showToast } = useAppUi();
  const demo = isDemoModeActive();
  const [pane, setPane] = useState<Pane>("hub");
  const [draft, setDraft] = useState<Draft>(() => draftFromSettings(null, false));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stripeReady, setStripeReady] = useState(false);

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

  useEffect(() => {
    if (!open) {
      setPane("hub");
      return;
    }
    void loadStripeStatus();
    if (demo) {
      setDraft(draftFromSettings(DEFAULT_MANAGER_MANUAL_PAYMENT_SETTINGS, false));
      return;
    }
    setLoading(true);
    void fetch("/api/portal/manager-manual-payment-settings", { credentials: "include" })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          settings?: ManagerManualPaymentSettings;
          error?: string;
        };
        if (!res.ok) {
          showToast(data.error ?? "Could not load payment setup.");
          return;
        }
        setDraft(draftFromSettings(data.settings ?? null, false));
      })
      .catch(() => showToast("Could not load payment setup."))
      .finally(() => setLoading(false));
  }, [open, demo, showToast]);

  async function saveManual(method: "zelle" | "venmo") {
    const zelleContact = sanitizePaymentContactInput(draft.zelleContact).trim();
    const venmoContact = sanitizePaymentContactInput(draft.venmoContact).trim();
    const nextDraft =
      method === "zelle"
        ? {
            ...draft,
            zellePaymentsEnabled: zelleContact.length > 0,
            zelleContact,
          }
        : {
            ...draft,
            venmoPaymentsEnabled: venmoContact.length > 0,
            venmoContact,
          };

    if (method === "zelle" && nextDraft.zellePaymentsEnabled && !zelleContact) {
      showToast("Enter a Zelle phone or email.");
      return;
    }
    if (method === "venmo" && nextDraft.venmoPaymentsEnabled && !venmoContact) {
      showToast("Enter a Venmo username, phone, or email.");
      return;
    }

    const payload: ManagerManualPaymentSettings & { applyToAllListings?: boolean } = {
      zellePaymentsEnabled: nextDraft.zellePaymentsEnabled,
      zelleContact: nextDraft.zelleContact,
      venmoPaymentsEnabled: nextDraft.venmoPaymentsEnabled,
      venmoContact: nextDraft.venmoContact,
      applyToAllListings: nextDraft.applyToAllListings,
    };

    if (demo) {
      setDraft(nextDraft);
      window.dispatchEvent(new CustomEvent(MANAGER_MANUAL_PAYMENT_SETTINGS_EVENT, { detail: payload }));
      showToast(`${method === "zelle" ? "Zelle" : "Venmo"} saved.`);
      setPane("hub");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/portal/manager-manual-payment-settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as {
        settings?: ManagerManualPaymentSettings;
        error?: string;
      };
      if (!res.ok || !data.settings) {
        showToast(data.error ?? "Could not save.");
        return;
      }
      setDraft(draftFromSettings(data.settings, nextDraft.applyToAllListings));
      window.dispatchEvent(new CustomEvent(MANAGER_MANUAL_PAYMENT_SETTINGS_EVENT, { detail: data.settings }));
      showToast(`${method === "zelle" ? "Zelle" : "Venmo"} saved.`);
      setPane("hub");
    } catch {
      showToast("Could not save.");
    } finally {
      setSaving(false);
    }
  }

  const zelleConnected = draft.zellePaymentsEnabled && draft.zelleContact.trim().length > 0;
  const venmoConnected = draft.venmoPaymentsEnabled && draft.venmoContact.trim().length > 0;

  const title =
    pane === "hub"
      ? "Link payment"
      : pane === "stripe"
        ? "Stripe link"
        : pane === "zelle"
          ? "Zelle link"
          : "Venmo link";

  const footer =
    pane === "hub" ? undefined : pane === "stripe" ? (
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          onClick={() => {
            void loadStripeStatus();
            setPane("hub");
          }}
        >
          Back
        </Button>
      </div>
    ) : (
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" className="rounded-full" onClick={() => setPane("hub")}>
          Back
        </Button>
        <Button
          type="button"
          variant="primary"
          className="rounded-full"
          disabled={saving || loading}
          onClick={() => void saveManual(pane)}
          data-attr={pane === "zelle" ? "manager-payment-zelle-save" : "manager-payment-venmo-save"}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    );

  return (
    <Modal open={open} title={title} onClose={onClose} footer={footer}>
      {pane === "hub" ? (
        <div className="space-y-2">
          {loading ? <p className="text-sm text-muted">Loading…</p> : null}
          <HubRow
            label="Stripe link"
            connected={stripeReady}
            onClick={() => setPane("stripe")}
            dataAttr="manager-payment-stripe-row"
          />
          <HubRow
            label="Zelle link"
            connected={zelleConnected}
            onClick={() => setPane("zelle")}
            dataAttr="manager-payment-zelle-row"
          />
          <HubRow
            label="Venmo link"
            connected={venmoConnected}
            onClick={() => setPane("venmo")}
            dataAttr="manager-payment-venmo-row"
          />
        </div>
      ) : null}

      {pane === "stripe" ? (
        <PortalStripeConnectPanel basePath={portalBase} variant="embedded" returnPath={`${portalBase}/payments`} />
      ) : null}

      {pane === "zelle" ? (
        <div className="space-y-3">
          <Input
            value={draft.zelleContact}
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, zelleContact: sanitizePaymentContactInput(e.target.value) }))
            }
            placeholder="Phone or email"
            data-attr="manager-payment-zelle-contact-input"
          />
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border"
              checked={draft.applyToAllListings}
              onChange={(e) => setDraft((prev) => ({ ...prev, applyToAllListings: e.target.checked }))}
              data-attr="manager-payment-apply-all-listings"
            />
            Apply to all listings
          </label>
        </div>
      ) : null}

      {pane === "venmo" ? (
        <div className="space-y-3">
          <Input
            value={draft.venmoContact}
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, venmoContact: sanitizePaymentContactInput(e.target.value) }))
            }
            placeholder="@username, phone, or email"
            data-attr="manager-payment-venmo-contact-input"
          />
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border"
              checked={draft.applyToAllListings}
              onChange={(e) => setDraft((prev) => ({ ...prev, applyToAllListings: e.target.checked }))}
              data-attr="manager-payment-apply-all-listings"
            />
            Apply to all listings
          </label>
        </div>
      ) : null}
    </Modal>
  );
}
