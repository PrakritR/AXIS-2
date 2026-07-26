"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
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
import { useGmailPaymentTrack } from "@/components/portal/gmail-payment-auto-track-panel";
import { stripeSetupStateFromStatus, type StripeSetupState } from "@/lib/stripe-setup-state";

const DEMO_INBOX = "payments+demo-token@prop-lane.space";

type PaymentChannel = "zelle" | "venmo";

function draftFromSettings(settings: ManagerManualPaymentSettingsView | null): ManagerManualPaymentSettingsView {
  return settings ?? { ...DEFAULT_MANAGER_MANUAL_PAYMENT_SETTINGS, paymentInboxAddress: DEMO_INBOX };
}

function HubRow({
  label,
  connected,
  onLink,
  dataAttr,
  busy,
  linkLabel = "Link",
  pending = false,
  pendingLabel = "Finish setup",
}: {
  label: string;
  connected: boolean;
  onLink: () => void;
  dataAttr: string;
  busy?: boolean;
  linkLabel?: string;
  /** Account exists but Stripe reports it cannot yet receive money (onboarding incomplete). */
  pending?: boolean;
  pendingLabel?: string;
}) {
  return (
    <div className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3.5">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      {connected ? (
        <button
          type="button"
          onClick={onLink}
          data-attr={dataAttr}
          className="text-sm font-medium text-[var(--status-confirmed-fg)] hover:underline"
        >
          Connected · Manage
        </button>
      ) : pending ? (
        <button
          type="button"
          onClick={onLink}
          disabled={busy}
          data-attr={dataAttr}
          className="text-sm font-medium text-[var(--status-pending-fg)] hover:underline disabled:opacity-50"
        >
          {busy ? "Opening…" : `${pendingLabel} →`}
        </button>
      ) : (
        <button
          type="button"
          onClick={onLink}
          disabled={busy}
          data-attr={dataAttr}
          className="text-sm font-medium text-primary hover:underline disabled:opacity-50"
        >
          {busy ? "Opening…" : linkLabel}
        </button>
      )}
    </div>
  );
}

function ChannelPaymentSetupModal({
  channel,
  open,
  onClose,
  draft,
  setDraft,
  saving,
  onSaveContact,
  paymentInboxAddress,
  autoMarkEnabled,
  onAutoMarkChange,
  gmailStatus,
  gmailBusy,
  gmailSyncBusy,
  onLinkGmail,
  onSyncGmail,
  showToast,
}: {
  channel: PaymentChannel;
  open: boolean;
  onClose: () => void;
  draft: ManagerManualPaymentSettingsView;
  setDraft: Dispatch<SetStateAction<ManagerManualPaymentSettingsView>>;
  saving: boolean;
  onSaveContact: () => void;
  paymentInboxAddress?: string;
  autoMarkEnabled: boolean;
  onAutoMarkChange: (enabled: boolean) => void | Promise<void>;
  gmailStatus: ReturnType<typeof useGmailPaymentTrack>["gmailStatus"];
  gmailBusy: boolean;
  gmailSyncBusy: boolean;
  onLinkGmail: () => void;
  onSyncGmail: () => void;
  showToast: (message: string) => void;
}) {
  const label = channel === "zelle" ? "Zelle" : "Venmo";
  const placeholder = channel === "zelle" ? "email or phone" : "@username or phone";
  const filterFrom = channel === "zelle" ? "zellepay.com" : "venmo.com";
  const contact = channel === "zelle" ? draft.zelleContact : draft.venmoContact;
  const contactConnected =
    channel === "zelle"
      ? draft.zellePaymentsEnabled && draft.zelleContact.trim().length > 0
      : draft.venmoPaymentsEnabled && draft.venmoContact.trim().length > 0;

  return (
    <Modal open={open} title={`Link ${label}`} onClose={onClose} dense assistantStrip={false}>
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Five quick steps so residents can pay you with {label} and we auto-match receipts.
        </p>

        <div className="space-y-2 rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-sm font-semibold text-foreground">Step 1 — Save your {label} contact</p>
          <p className="text-xs text-muted">Residents will see this on their payment screen.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={contact}
              onChange={(e) =>
                setDraft((prev) =>
                  channel === "zelle" ? { ...prev, zelleContact: e.target.value } : { ...prev, venmoContact: e.target.value },
                )
              }
              placeholder={placeholder}
              className="flex-1"
              data-attr={`manager-payment-${channel}-save-input`}
            />
            <Button
              type="button"
              variant="outline"
              className="shrink-0 rounded-full"
              disabled={saving || !contact.trim()}
              data-attr={`manager-payment-${channel}-save`}
              onClick={onSaveContact}
            >
              {saving ? "Saving…" : contactConnected ? "Update" : "Save"}
            </Button>
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-sm font-semibold text-foreground">Step 2 — Turn on {label} email notifications</p>
          <p className="text-xs text-muted">
            {channel === "zelle" ? (
              <>
                In your bank&apos;s Zelle settings, enable email alerts for money received. In the Zelle app, open
                Settings → Notifications and turn on payment emails.
              </>
            ) : (
              <>
                In the Venmo app, open Settings → Notifications and enable emails for payments you receive.
              </>
            )}
          </p>
        </div>

        <div className="space-y-2 rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-sm font-semibold text-foreground">Step 3 — Link Gmail</p>
          <p className="text-xs text-muted">
            We read {label} notification emails and match the <span className="font-mono">PL-</span> code and amount.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {gmailStatus?.connected ? (
              <span className="text-sm font-medium text-[var(--status-confirmed-fg)]">
                {gmailStatus.email ?? "Connected"}
              </span>
            ) : (
              <button
                type="button"
                onClick={onLinkGmail}
                disabled={gmailBusy || gmailStatus?.configured === false}
                data-attr={`manager-payment-${channel}-gmail-link`}
                className="text-sm font-medium text-primary hover:underline disabled:opacity-50"
              >
                {gmailBusy ? "Opening…" : "Link Gmail"}
              </button>
            )}
            {gmailStatus?.connected ? (
              <Button
                type="button"
                variant="outline"
                className="h-7 rounded-full px-3 text-xs"
                disabled={gmailSyncBusy}
                data-attr={`manager-payment-${channel}-gmail-sync`}
                onClick={onSyncGmail}
              >
                {gmailSyncBusy ? "Syncing…" : "Sync now"}
              </Button>
            ) : null}
          </div>
          {gmailStatus?.configured === false ? (
            <p className="text-xs text-muted">Google sign-in is not configured on this server.</p>
          ) : null}
        </div>

        {paymentInboxAddress ? (
          <div className="space-y-3 rounded-xl border border-border bg-card px-4 py-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Step 4 — Gmail filter (optional)</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                Skip this if Step 3 (Link Gmail) is connected. Otherwise set up a filter to forward {label} emails to
                PropLane.
              </p>
            </div>
            <ol className="space-y-3 text-sm leading-relaxed text-foreground">
              <li className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-foreground">
                  1
                </span>
                <span className="pt-0.5">
                  In Gmail, open <span className="font-medium">Settings</span> →{" "}
                  <span className="font-medium">Filters and Blocked Addresses</span> →{" "}
                  <span className="font-medium">Create a new filter</span>.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-foreground">
                  2
                </span>
                <div className="min-w-0 flex-1 space-y-2 pt-0.5">
                  <p>
                    Set <span className="font-medium">From</span> to:
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <code className="block w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm font-semibold text-foreground">
                      {filterFrom}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0 rounded-full px-4 text-[13px]"
                      onClick={() =>
                        void navigator.clipboard?.writeText(filterFrom).then(() => showToast("Copied."))
                      }
                    >
                      Copy
                    </Button>
                  </div>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-foreground">
                  3
                </span>
                <div className="min-w-0 flex-1 space-y-2 pt-0.5">
                  <p>
                    Choose <span className="font-medium">Forward it to</span> and use this address:
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <code className="block w-full break-all rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm font-semibold text-foreground">
                      {paymentInboxAddress}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0 rounded-full px-4 text-[13px]"
                      data-attr={`manager-payment-${channel}-inbox-copy`}
                      onClick={() =>
                        void navigator.clipboard?.writeText(paymentInboxAddress).then(() => showToast("Copied."))
                      }
                    >
                      Copy
                    </Button>
                  </div>
                </div>
              </li>
            </ol>
          </div>
        ) : null}

        <div className="space-y-2 rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-sm font-semibold text-foreground">Step 5 — Auto-mark charges paid</p>
          <label className="flex cursor-pointer items-start gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={autoMarkEnabled}
              onChange={(e) => void onAutoMarkChange(e.target.checked)}
              data-attr={`manager-payment-${channel}-auto-mark`}
            />
            <span className="text-xs leading-relaxed text-muted">
              When a {label} receipt matches a charge, mark it paid automatically.
            </span>
          </label>
        </div>
      </div>
    </Modal>
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
  const [stripeState, setStripeState] = useState<StripeSetupState>("unlinked");
  const [stripeIssue, setStripeIssue] = useState<string | null>(null);
  const [savingChannel, setSavingChannel] = useState<PaymentChannel | null>(null);
  const [activeChannel, setActiveChannel] = useState<PaymentChannel | null>(null);

  const { gmailStatus, gmailBusy, gmailSyncBusy, linkGmail, syncGmail } = useGmailPaymentTrack({
    role: "manager",
    demo,
    showToast,
  });

  const loadStripeStatus = useCallback(async () => {
    if (demo) {
      setStripeState("ready");
      setStripeIssue(null);
      return;
    }
    try {
      const res = await fetch("/api/stripe/connect/status", { credentials: "include" });
      const body = (await res.json()) as {
        payoutsEnabled?: boolean;
        chargesEnabled?: boolean;
        transfersEnabled?: boolean;
        paymentReady?: boolean;
        connected?: boolean;
        accountId?: string | null;
        stripeError?: string | null;
        demo?: boolean;
        message?: string;
      };
      if (!res.ok) {
        setStripeState("unknown");
        setStripeIssue("Couldn't check your Stripe status. Try again.");
        return;
      }
      const nextState = stripeSetupStateFromStatus(body);
      setStripeState(nextState);
      setStripeIssue(
        nextState === "unknown"
          ? body.stripeError ?? body.message ?? "Couldn't check your Stripe status. Try again."
          : null,
      );
    } catch {
      setStripeState("unknown");
      setStripeIssue("Couldn't check your Stripe status. Try again.");
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
    if (!open) {
      setActiveChannel(null);
      return;
    }
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
    channel: PaymentChannel | null = null,
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
        body: JSON.stringify({
          ...draft,
          ...patch,
          applyToAllListings: true,
          receiptAutoMarkEnabled: patch.receiptAutoMarkEnabled ?? draft.receiptAutoMarkEnabled !== false,
        }),
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

  async function linkStripe() {
    setStripeBusy(true);
    try {
      await openStripeConnectOnboarding({ showToast });
    } finally {
      setStripeBusy(false);
    }
  }

  async function toggleAutoMark(enabled: boolean) {
    await persistSettings({ receiptAutoMarkEnabled: enabled });
  }

  const zelleContactConnected = draft.zellePaymentsEnabled && draft.zelleContact.trim().length > 0;
  const venmoContactConnected = draft.venmoPaymentsEnabled && draft.venmoContact.trim().length > 0;
  const gmailLinked = Boolean(gmailStatus?.connected);
  const autoMarkOn = draft.receiptAutoMarkEnabled !== false;
  const zelleTrackingReady = zelleContactConnected && gmailLinked && autoMarkOn;
  const venmoTrackingReady = venmoContactConnected && gmailLinked && autoMarkOn;

  const channelModalProps = {
    draft,
    setDraft,
    paymentInboxAddress: draft.paymentInboxAddress,
    autoMarkEnabled: autoMarkOn,
    onAutoMarkChange: toggleAutoMark,
    gmailStatus,
    gmailBusy,
    gmailSyncBusy,
    onLinkGmail: linkGmail,
    onSyncGmail: () => void syncGmail(),
    showToast,
  };

  return (
    <>
      <Modal open={open} title="Payment setup" onClose={onClose} assistantStrip={false}>
        <div className="space-y-3">
          {loading ? <p className="text-sm text-muted">Loading…</p> : null}
          <p className="text-xs text-muted">
            Stripe deposits resident payments into your own connected Stripe account and pays out to your bank, not to
            PropLane. Each manager links their own account.
          </p>
          <HubRow
            label="Stripe"
            connected={stripeState === "ready"}
            pending={stripeState === "incomplete"}
            pendingLabel="Finish setup"
            onLink={() => void linkStripe()}
            dataAttr="manager-payment-stripe-link"
            busy={stripeBusy}
          />
          {stripeState === "incomplete" ? (
            <p className="text-xs text-[var(--status-pending-fg)]">
              Your Stripe account isn&apos;t ready to receive money yet. Finish onboarding (identity + bank details) so
              resident payments can be deposited.
            </p>
          ) : null}
          {stripeState === "unknown" && stripeIssue ? (
            <p className="text-xs text-[var(--status-pending-fg)]">{stripeIssue}</p>
          ) : null}
          <HubRow
            label="Zelle"
            connected={zelleTrackingReady}
            onLink={() => setActiveChannel("zelle")}
            dataAttr="manager-payment-zelle-link"
            linkLabel="Link Zelle"
          />
          <HubRow
            label="Venmo"
            connected={venmoTrackingReady}
            onLink={() => setActiveChannel("venmo")}
            dataAttr="manager-payment-venmo-link"
            linkLabel="Link Venmo"
          />
        </div>
      </Modal>

      {activeChannel ? (
        <ChannelPaymentSetupModal
          channel={activeChannel}
          open
          onClose={() => setActiveChannel(null)}
          saving={savingChannel === activeChannel}
          onSaveContact={() =>
            void persistSettings(
              activeChannel === "zelle"
                ? {
                    zelleContact: draft.zelleContact.trim(),
                    zellePaymentsEnabled: draft.zelleContact.trim().length > 0,
                  }
                : {
                    venmoContact: draft.venmoContact.trim(),
                    venmoPaymentsEnabled: draft.venmoContact.trim().length > 0,
                  },
              activeChannel,
            )
          }
          {...channelModalProps}
        />
      ) : null}
    </>
  );
}
