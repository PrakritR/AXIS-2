"use client";

import { useEffect, useState } from "react";
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

function draftFromSettings(settings: ManagerManualPaymentSettings | null, applyToAll: boolean): Draft {
  return {
    ...(settings ?? DEFAULT_MANAGER_MANUAL_PAYMENT_SETTINGS),
    applyToAllListings: applyToAll,
  };
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
  const [draft, setDraft] = useState<Draft>(() => draftFromSettings(null, false));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
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

  async function save() {
    const zelleContact = sanitizePaymentContactInput(draft.zelleContact).trim();
    const venmoContact = sanitizePaymentContactInput(draft.venmoContact).trim();
    if (draft.zellePaymentsEnabled && !zelleContact) {
      showToast("Enter a Zelle phone or email, or turn Zelle off.");
      return;
    }
    if (draft.venmoPaymentsEnabled && !venmoContact) {
      showToast("Enter a Venmo username, phone, or email, or turn Venmo off.");
      return;
    }

    const payload: ManagerManualPaymentSettings & { applyToAllListings?: boolean } = {
      zellePaymentsEnabled: draft.zellePaymentsEnabled,
      zelleContact,
      venmoPaymentsEnabled: draft.venmoPaymentsEnabled,
      venmoContact,
      applyToAllListings: draft.applyToAllListings,
    };

    if (demo) {
      window.dispatchEvent(new CustomEvent(MANAGER_MANUAL_PAYMENT_SETTINGS_EVENT, { detail: payload }));
      showToast("Payment setup saved (demo).");
      onClose();
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
        listingsUpdated?: number;
        error?: string;
      };
      if (!res.ok || !data.settings) {
        showToast(data.error ?? "Could not save payment setup.");
        return;
      }
      window.dispatchEvent(new CustomEvent(MANAGER_MANUAL_PAYMENT_SETTINGS_EVENT, { detail: data.settings }));
      const applied =
        draft.applyToAllListings && typeof data.listingsUpdated === "number" && data.listingsUpdated > 0
          ? ` Applied to ${data.listingsUpdated} listing${data.listingsUpdated === 1 ? "" : "s"}.`
          : "";
      showToast(`Payment setup saved.${applied}`);
      onClose();
    } catch {
      showToast("Could not save payment setup.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Payment setup"
      onClose={onClose}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" className="rounded-full" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            className="rounded-full"
            onClick={() => void save()}
            disabled={saving || loading}
            data-attr="manager-payment-setup-save"
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-muted">
          Connect how residents pay you: bank deposits through Stripe, plus Zelle and Venmo for manual payments
          residents report in the portal. Include the payment reference code in Zelle/Venmo memos so you can match
          payments on your ledger.
        </p>

        {loading ? <p className="text-muted">Loading…</p> : null}

        <div className="space-y-2 rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-semibold text-foreground">Bank deposits (Stripe)</p>
          <p className="text-xs text-muted">Link a bank account to receive card and ACH payments from residents.</p>
          <PortalStripeConnectPanel basePath={portalBase} variant="embedded" returnPath={`${portalBase}/payments`} />
        </div>

        <div className="space-y-2 rounded-xl border border-border bg-card p-4">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 rounded border-border"
              checked={draft.zellePaymentsEnabled}
              onChange={(e) => setDraft((prev) => ({ ...prev, zellePaymentsEnabled: e.target.checked }))}
              data-attr="manager-payment-zelle-toggle"
            />
            <span className="text-sm font-medium text-foreground">Zelle</span>
          </label>
          {draft.zellePaymentsEnabled ? (
            <div className="pl-7">
              <label className="text-xs font-semibold text-muted">Zelle phone or email</label>
              <Input
                className="mt-1"
                value={draft.zelleContact}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, zelleContact: sanitizePaymentContactInput(e.target.value) }))
                }
                placeholder="+1 555 010 8899 or name@email.com"
                data-attr="manager-payment-zelle-contact-input"
              />
            </div>
          ) : null}
        </div>

        <div className="space-y-2 rounded-xl border border-border bg-card p-4">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 rounded border-border"
              checked={draft.venmoPaymentsEnabled}
              onChange={(e) => setDraft((prev) => ({ ...prev, venmoPaymentsEnabled: e.target.checked }))}
              data-attr="manager-payment-venmo-toggle"
            />
            <span className="text-sm font-medium text-foreground">Venmo</span>
          </label>
          {draft.venmoPaymentsEnabled ? (
            <div className="pl-7">
              <label className="text-xs font-semibold text-muted">Venmo username, phone, or email</label>
              <Input
                className="mt-1"
                value={draft.venmoContact}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, venmoContact: sanitizePaymentContactInput(e.target.value) }))
                }
                placeholder="@username, +1 555 010 8899, or name@email.com"
                data-attr="manager-payment-venmo-contact-input"
              />
            </div>
          ) : null}
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-accent/20 px-4 py-3">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-border"
            checked={draft.applyToAllListings}
            onChange={(e) => setDraft((prev) => ({ ...prev, applyToAllListings: e.target.checked }))}
            data-attr="manager-payment-apply-all-listings"
          />
          <span className="text-sm text-foreground">
            Apply Zelle and Venmo contacts to all my active listings (new listings always inherit these defaults).
          </span>
        </label>
      </div>
    </Modal>
  );
}
