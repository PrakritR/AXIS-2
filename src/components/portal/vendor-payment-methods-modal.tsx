"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import { sanitizePaymentContactInput } from "@/lib/listing-form-inputs";
import type { ManagerVendorRow } from "@/lib/manager-vendors-storage";
import {
  buildVendorAcceptedPaymentMethods,
  VENDOR_ACCEPTED_PAYMENT_METHOD_LABELS,
  type VendorAcceptedPaymentMethod,
} from "@/lib/vendor-payment-methods";

type VendorPaymentMethodsDraft = {
  zellePaymentsEnabled: boolean;
  zelleContact: string;
  venmoPaymentsEnabled: boolean;
  venmoContact: string;
  achPaymentsEnabled: boolean;
};

function draftFromProfile(profile: ManagerVendorRow | null): VendorPaymentMethodsDraft {
  return {
    zellePaymentsEnabled: Boolean(profile?.zellePaymentsEnabled),
    zelleContact: profile?.zelleContact ?? "",
    venmoPaymentsEnabled: Boolean(profile?.venmoPaymentsEnabled),
    venmoContact: profile?.venmoContact ?? "",
    achPaymentsEnabled: Boolean(profile?.achPaymentsEnabled),
  };
}

export function VendorPaymentMethodsModal({
  open,
  onClose,
  profile,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  profile: ManagerVendorRow | null;
  onSaved: (profile: ManagerVendorRow) => void;
}) {
  const { showToast } = useAppUi();
  const demo = isDemoModeActive();
  const [draft, setDraft] = useState<VendorPaymentMethodsDraft>(() => draftFromProfile(profile));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(draftFromProfile(profile));
  }, [open, profile]);

  const toggleMethod = (method: VendorAcceptedPaymentMethod, enabled: boolean) => {
    if (method === "zelle") setDraft((prev) => ({ ...prev, zellePaymentsEnabled: enabled }));
    if (method === "venmo") setDraft((prev) => ({ ...prev, venmoPaymentsEnabled: enabled }));
    if (method === "ach") setDraft((prev) => ({ ...prev, achPaymentsEnabled: enabled }));
  };

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
    if (!draft.zellePaymentsEnabled && !draft.venmoPaymentsEnabled && !draft.achPaymentsEnabled) {
      showToast("Enable at least one payment method.");
      return;
    }

    const acceptedPaymentMethods = buildVendorAcceptedPaymentMethods({
      zellePaymentsEnabled: draft.zellePaymentsEnabled,
      zelleContact,
      venmoPaymentsEnabled: draft.venmoPaymentsEnabled,
      venmoContact,
      achPaymentsEnabled: draft.achPaymentsEnabled,
    });

    const payload = {
      zellePaymentsEnabled: draft.zellePaymentsEnabled,
      zelleContact,
      venmoPaymentsEnabled: draft.venmoPaymentsEnabled,
      venmoContact,
      achPaymentsEnabled: draft.achPaymentsEnabled,
      acceptedPaymentMethods,
    };

    if (demo) {
      if (!profile) {
        showToast("No vendor profile in demo mode.");
        return;
      }
      onSaved({ ...profile, ...payload });
      showToast("Payment methods saved.");
      onClose();
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/vendor/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { profile?: ManagerVendorRow; error?: string };
      if (!res.ok || !data.profile) {
        showToast(data.error ?? "Could not save payment methods.");
        return;
      }
      onSaved(data.profile);
      showToast("Payment methods saved.");
      onClose();
    } catch {
      showToast("Could not save payment methods.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} title="Payment methods" onClose={onClose}>
      <div className="space-y-4 text-sm">
        <p className="text-muted">
          Choose how property managers can pay you for completed work. These details are shared when you send payment
          reminders.
        </p>

        <div className="space-y-2 rounded-xl border border-border bg-card p-4">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 rounded border-border"
              checked={draft.zellePaymentsEnabled}
              onChange={(e) => toggleMethod("zelle", e.target.checked)}
              data-attr="vendor-payment-zelle-toggle"
            />
            <span className="text-sm font-medium text-foreground">{VENDOR_ACCEPTED_PAYMENT_METHOD_LABELS.zelle}</span>
          </label>
          {draft.zellePaymentsEnabled ? (
            <div className="pl-7">
              <label className="text-xs font-semibold text-muted">Zelle phone or email</label>
              <Input
                className="mt-1"
                value={draft.zelleContact}
                onChange={(e) => setDraft((prev) => ({ ...prev, zelleContact: sanitizePaymentContactInput(e.target.value) }))}
                placeholder="+1 555 010 8899 or name@email.com"
                data-attr="vendor-payment-zelle-contact-input"
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
              onChange={(e) => toggleMethod("venmo", e.target.checked)}
              data-attr="vendor-payment-venmo-toggle"
            />
            <span className="text-sm font-medium text-foreground">{VENDOR_ACCEPTED_PAYMENT_METHOD_LABELS.venmo}</span>
          </label>
          {draft.venmoPaymentsEnabled ? (
            <div className="pl-7">
              <label className="text-xs font-semibold text-muted">Venmo username, phone, or email</label>
              <Input
                className="mt-1"
                value={draft.venmoContact}
                onChange={(e) => setDraft((prev) => ({ ...prev, venmoContact: sanitizePaymentContactInput(e.target.value) }))}
                placeholder="@username, +1 555 010 8899, or name@email.com"
                data-attr="vendor-payment-venmo-contact-input"
              />
            </div>
          ) : null}
        </div>

        <div className="space-y-2 rounded-xl border border-border bg-card p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-border"
              checked={draft.achPaymentsEnabled}
              onChange={(e) => toggleMethod("ach", e.target.checked)}
              data-attr="vendor-payment-ach-toggle"
            />
            <span className="text-sm font-medium text-foreground">
              {VENDOR_ACCEPTED_PAYMENT_METHOD_LABELS.ach} with Stripe Connect
            </span>
          </label>
          {draft.achPaymentsEnabled ? (
            <p className="pl-7 text-xs text-muted">
              Use <span className="font-medium text-foreground">Link bank</span> on this page to connect your account for
              direct bank payouts.
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button type="button" variant="outline" className="rounded-full" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            className="rounded-full"
            onClick={() => void save()}
            disabled={saving}
            data-attr="vendor-payment-methods-save"
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
