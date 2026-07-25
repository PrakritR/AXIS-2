"use client";

import { useCallback, useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import { openStripeConnectOnboarding } from "@/lib/stripe-connect-onboarding-client";
import {
  DEFAULT_MANAGER_MANUAL_PAYMENT_SETTINGS,
  MANAGER_MANUAL_PAYMENT_SETTINGS_EVENT,
  type ManagerManualPaymentSettings,
} from "@/lib/manager-manual-payment-settings";

const ZELLE_URL = "https://www.zellepay.com/";
const VENMO_URL = "https://account.venmo.com/";

function draftFromSettings(settings: ManagerManualPaymentSettings | null): ManagerManualPaymentSettings {
  return settings ?? DEFAULT_MANAGER_MANUAL_PAYMENT_SETTINGS;
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
  const [draft, setDraft] = useState<ManagerManualPaymentSettings>(() =>
    draftFromSettings(null),
  );
  const [loading, setLoading] = useState(false);
  const [stripeBusy, setStripeBusy] = useState(false);
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
    if (!open) return;
    void loadStripeStatus();
    if (demo) {
      setDraft(draftFromSettings(DEFAULT_MANAGER_MANUAL_PAYMENT_SETTINGS));
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
        setDraft(draftFromSettings(data.settings ?? null));
      })
      .catch(() => showToast("Could not load payment setup."))
      .finally(() => setLoading(false));
  }, [open, demo, showToast, loadStripeStatus]);

  useEffect(() => {
    if (!open) return;
    const onFocus = () => void loadStripeStatus();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [open, loadStripeStatus]);

  function openExternal(url: string) {
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) {
      showToast("Allow pop-ups to open the link.");
    }
  }

  async function linkStripe() {
    setStripeBusy(true);
    try {
      await openStripeConnectOnboarding({ showToast });
    } finally {
      setStripeBusy(false);
    }
  }

  function linkZelle() {
    openExternal(ZELLE_URL);
  }

  function linkVenmo() {
    openExternal(VENMO_URL);
  }

  const zelleConnected = draft.zellePaymentsEnabled && draft.zelleContact.trim().length > 0;
  const venmoConnected = draft.venmoPaymentsEnabled && draft.venmoContact.trim().length > 0;

  return (
    <Modal open={open} title="Link payment" onClose={onClose}>
      <div className="space-y-2">
        {loading ? <p className="text-sm text-muted">Loading…</p> : null}
        <HubRow
          label="Stripe link"
          connected={stripeReady}
          onLink={() => void linkStripe()}
          dataAttr="manager-payment-stripe-link"
          busy={stripeBusy}
        />
        <HubRow
          label="Zelle link"
          connected={zelleConnected}
          onLink={linkZelle}
          dataAttr="manager-payment-zelle-link"
        />
        <HubRow
          label="Venmo link"
          connected={venmoConnected}
          onLink={linkVenmo}
          dataAttr="manager-payment-venmo-link"
        />
      </div>
    </Modal>
  );
}
