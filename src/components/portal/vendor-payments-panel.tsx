"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ManagerPortalFilterRow,
  ManagerPortalPageShell,
  ManagerPortalStatusPills,
  MANAGER_TABLE_TH,
  PORTAL_HEADER_ACTION_BTN,
} from "@/components/portal/portal-metrics";
import {
  PORTAL_DATA_TABLE,
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PORTAL_DETAIL_BTN,
  PORTAL_MOBILE_CARD_CLASS,
  PORTAL_MOBILE_DETAIL_EXPAND,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TD,
  PORTAL_TABLE_TR_EXPANDABLE,
  PORTAL_TABLE_EXPAND_TH,
  PortalDataTableEmpty,
  PortalTableDetailActions,
  PortalTableExpandCell,
  PortalTableExpandChevron,
  createPortalRowExpandClick,
} from "@/components/portal/portal-data-table";
import { VendorPaymentMethodsModal } from "@/components/portal/vendor-payment-methods-modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import type { ManagerVendorRow } from "@/lib/manager-vendors-storage";
import {
  MANAGER_WORK_ORDERS_EVENT,
  readVendorWorkOrderRows,
  syncManagerWorkOrdersFromServer,
} from "@/lib/manager-work-orders-storage";
import { safeFormatDateTime } from "@/lib/pacific-time";
import { fetchVendorPayoutsResult, type VendorPayout } from "@/lib/vendor-payouts";
import { VENDOR_ACCEPTED_PAYMENT_METHOD_LABELS } from "@/lib/vendor-payment-methods";
import { managerVendorPayMethodLabel } from "@/lib/manager-vendor-payment-flow";

type VendorPaymentBucket = "pending" | "paid";

type VendorPaymentLedgerRow = {
  id: string;
  propertyName: string;
  workOrderTitle: string;
  amountLabel: string;
  statusLabel: string;
  dateLabel: string;
  bucket: VendorPaymentBucket;
  payoutStatus: string | null;
  payoutFailureReason: string | null;
};

const PAY_LABELS: { id: VendorPaymentBucket; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "paid", label: "Paid" },
];

function propertyLabel(row: DemoManagerWorkOrderRow): string {
  const unit = row.unit?.trim();
  return unit && unit !== "—" ? `${row.propertyName} · ${unit}` : row.propertyName;
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function workOrderAmountCents(row: DemoManagerWorkOrderRow): number {
  const labor = row.vendorCostCents ?? 0;
  const materials = row.materialsCostCents ?? 0;
  if (labor + materials > 0) return labor + materials;
  const parsed = parseFloat((row.cost ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) : 0;
}

function vendorPaymentBucket(row: DemoManagerWorkOrderRow): VendorPaymentBucket | null {
  if (row.automationStatus === "paid") return "paid";
  if (row.bucket !== "completed" && row.automationStatus !== "vendor_marked_done") return null;
  return "pending";
}

function payoutStatusLabel(payout: VendorPayout | undefined): string | null {
  if (!payout) return null;
  if (payout.status === "paid") return "Payout sent";
  if (payout.status === "failed") return "Payout failed";
  if (payout.status === "skipped") return "Payout skipped";
  return null;
}

function statusTone(label: string) {
  const l = label.toLowerCase();
  if (l.includes("paid") || l.includes("sent")) {
    return "portal-badge-success ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";
  }
  if (l.includes("overdue") || l.includes("failed")) {
    return "portal-badge-danger ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";
  }
  if (l.includes("pending") || l.includes("awaiting")) {
    return "portal-badge-pending ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";
  }
  return "bg-accent/30 text-foreground ring-1 ring-border";
}

function toLedgerRow(row: DemoManagerWorkOrderRow, payout: VendorPayout | undefined): VendorPaymentLedgerRow | null {
  const bucket = vendorPaymentBucket(row);
  if (!bucket) return null;

  const amountCents = workOrderAmountCents(row);
  const payoutLabel = payoutStatusLabel(payout);

  let statusLabel = "Awaiting payment";
  if (bucket === "paid") {
    statusLabel = payoutLabel ?? "Paid";
  } else if (row.automationStatus === "vendor_marked_done") {
    statusLabel = "Awaiting approval";
  }

  const dateIso =
    bucket === "paid"
      ? row.paidAt ?? payout?.createdAt ?? row.completedAt
      : row.vendorMarkedDoneAt ?? row.completedAt;
  const dateLabel = dateIso ? safeFormatDateTime(dateIso) : "—";

  return {
    id: row.id,
    propertyName: propertyLabel(row),
    workOrderTitle: row.title,
    amountLabel: amountCents > 0 ? formatMoney(amountCents) : row.cost || "—",
    statusLabel,
    dateLabel,
    bucket,
    payoutStatus: payoutLabel,
    payoutFailureReason: payout?.failureReason ?? null,
  };
}

type VendorPaymentNotifyAction = "send_reminder";

function VendorPaymentPendingActions({
  workOrderId,
  onDone,
}: {
  workOrderId: string;
  onDone?: () => void;
}) {
  const { showToast } = useAppUi();
  const demo = isDemoModeActive();
  const [busy, setBusy] = useState(false);

  const sendReminder = async () => {
    if (demo) {
      showToast("Reminder sent to your property manager.");
      onDone?.();
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/vendor/work-orders/payment-notify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workOrderId, action: "send_reminder" }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        showToast(data.error ?? "Could not send notification.");
        return;
      }
      showToast("Reminder sent.");
      onDone?.();
    } catch {
      showToast("Could not send notification.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PortalTableDetailActions>
      <Button
        type="button"
        variant="outline"
        className={PORTAL_DETAIL_BTN}
        data-portal-row-ignore
        disabled={busy}
        data-attr="vendor-payments-send-reminder"
        onClick={() => void sendReminder()}
      >
        {busy ? "Sending reminder…" : "Send reminder"}
      </Button>
    </PortalTableDetailActions>
  );
}

function VendorPaymentExpandedDetail({
  row,
  workOrder,
  vendorProfile,
  bucket,
}: {
  row: VendorPaymentLedgerRow;
  workOrder: DemoManagerWorkOrderRow;
  vendorProfile: ManagerVendorRow | null;
  bucket: VendorPaymentBucket;
}) {
  const { showToast } = useAppUi();
  const showActions = bucket === "pending";
  const paidChannel = workOrder.vendorPaymentChannel;

  return (
    <div className={PORTAL_MOBILE_DETAIL_EXPAND}>
      <p className="mb-3 text-sm text-muted">
        {bucket === "paid" ? "Paid" : "Updated"}:{" "}
        <span className="font-semibold text-foreground">{row.dateLabel}</span>
        {" · "}
        Amount: <span className="font-semibold text-foreground">{row.amountLabel}</span>
      </p>

      {paidChannel && bucket === "paid" ? (
        <div className="glass-card mb-4 rounded-lg px-3 py-2.5 text-[var(--status-confirmed-fg)]">
          <p className="text-xs font-semibold">Paid via {managerVendorPayMethodLabel(paidChannel)}</p>
          {paidChannel === "zelle" && workOrder.vendorZelleContactSnapshot ? (
            <p className="mt-1 text-sm leading-relaxed">
              Sent to <span className="font-mono font-medium">{workOrder.vendorZelleContactSnapshot}</span>
            </p>
          ) : null}
          {paidChannel === "venmo" && workOrder.vendorVenmoContactSnapshot ? (
            <p className="mt-1 text-sm leading-relaxed">
              Sent to <span className="font-mono font-medium">{workOrder.vendorVenmoContactSnapshot}</span>
            </p>
          ) : null}
          {paidChannel === "ach" ? (
            <p className="mt-1 text-sm leading-relaxed">
              {row.payoutStatus ?? "ACH transfer through Axis when your bank is linked."}
            </p>
          ) : null}
        </div>
      ) : null}

      {bucket === "pending" && vendorProfile?.zellePaymentsEnabled && vendorProfile.zelleContact?.trim() ? (
        <div className="glass-card mb-4 rounded-lg px-3 py-2.5 text-[var(--status-confirmed-fg)]">
          <p className="text-xs font-semibold">{VENDOR_ACCEPTED_PAYMENT_METHOD_LABELS.zelle}</p>
          <p className="mt-1 text-sm leading-relaxed">
            Your manager can send to{" "}
            <span className="font-mono font-medium">{vendorProfile.zelleContact.trim()}</span>. Include the work order
            title in the memo.
          </p>
        </div>
      ) : null}

      {bucket === "pending" && vendorProfile?.venmoPaymentsEnabled && vendorProfile.venmoContact?.trim() ? (
        <div className="glass-card mb-4 rounded-lg px-3 py-2.5 text-[var(--status-approved-fg)]">
          <p className="text-xs font-semibold">{VENDOR_ACCEPTED_PAYMENT_METHOD_LABELS.venmo}</p>
          <p className="mt-1 text-sm leading-relaxed">
            Your manager can send to{" "}
            <span className="font-mono font-medium">{vendorProfile.venmoContact.trim()}</span>. Include the property and
            work order in the note.
          </p>
        </div>
      ) : null}

      {bucket === "pending" && vendorProfile?.achPaymentsEnabled ? (
        <div className="glass-card mb-4 rounded-lg px-3 py-2.5 text-[var(--status-pending-fg)]">
          <p className="text-xs font-semibold">Pay through Axis (ACH)</p>
          <p className="mt-1 text-sm leading-relaxed">
            When your bank is linked, your manager can approve &amp; pay to send an ACH transfer automatically.
          </p>
        </div>
      ) : null}

      {row.payoutFailureReason ? (
        <p className="mb-4 text-xs text-muted">{row.payoutFailureReason}</p>
      ) : null}

      {showActions ? <VendorPaymentPendingActions workOrderId={row.id} /> : null}

      <PortalTableDetailActions>
        <Button
          type="button"
          variant="outline"
          className={PORTAL_DETAIL_BTN}
          onClick={() => {
            void navigator.clipboard?.writeText(row.amountLabel);
            showToast("Amount copied.");
          }}
        >
          Copy amount
        </Button>
      </PortalTableDetailActions>
    </div>
  );
}

/** Vendor Payments — payout history from completed work orders + Stripe Connect bank linking. */
export function VendorPaymentsPanel() {
  const { showToast } = useAppUi();
  const demo = isDemoModeActive();

  const [bucket, setBucket] = useState<VendorPaymentBucket>("pending");
  const [tick, setTick] = useState(0);
  const [payoutsByWorkOrderId, setPayoutsByWorkOrderId] = useState<Record<string, VendorPayout>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [unlinked, setUnlinked] = useState(false);
  const [vendorProfile, setVendorProfile] = useState<ManagerVendorRow | null>(null);
  const [paymentMethodsOpen, setPaymentMethodsOpen] = useState(false);

  const loadVendorProfile = useCallback(async () => {
    if (isDemoModeActive()) {
      setVendorProfile({
        id: "demo-vendor",
        managerUserId: null,
        name: "Demo Vendor",
        trade: "HVAC",
        phone: "",
        email: "",
        notes: "",
        active: true,
      });
      return;
    }
    const res = await fetch("/api/vendor/profile", { credentials: "include" });
    const data = (await res.json().catch(() => ({}))) as { profile?: ManagerVendorRow | null };
    setVendorProfile(data.profile ?? null);
  }, []);

  const loadPayouts = useCallback(async () => {
    const result = await fetchVendorPayoutsResult();
    if (!result.ok) return;
    setPayoutsByWorkOrderId(Object.fromEntries(result.payouts.map((p) => [p.workOrderId, p])));
  }, []);

  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    void syncManagerWorkOrdersFromServer().then(bump);
    void loadPayouts();
    window.addEventListener(MANAGER_WORK_ORDERS_EVENT, bump);
    return () => window.removeEventListener(MANAGER_WORK_ORDERS_EVENT, bump);
  }, [loadPayouts]);

  useEffect(() => {
    if (demo) return;
    void fetch("/api/vendor/profile", { credentials: "include" })
      .then((r) => r.json())
      .then((data: { linked?: boolean; profile?: ManagerVendorRow | null }) => {
        setUnlinked(data.linked === false);
        setVendorProfile(data.profile ?? null);
      })
      .catch(() => undefined);
  }, [demo]);

  useEffect(() => {
    if (!paymentMethodsOpen) return;
    void loadVendorProfile();
  }, [paymentMethodsOpen, loadVendorProfile]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const connect = new URLSearchParams(window.location.search).get("connect");
    if (connect === "done") {
      showToast("Bank account linked.");
    } else if (connect === "refresh") {
      showToast("Setup link expired — open Payment methods and try again.");
    }
  }, [showToast]);

  const workOrderById = useMemo(() => {
    void tick;
    const map = new Map<string, DemoManagerWorkOrderRow>();
    for (const row of readVendorWorkOrderRows()) map.set(row.id, row);
    return map;
  }, [tick]);

  const ledgerRows = useMemo(() => {
    void tick;
    return readVendorWorkOrderRows()
      .map((row) => toLedgerRow(row, payoutsByWorkOrderId[row.id]))
      .filter((row): row is VendorPaymentLedgerRow => row !== null);
  }, [tick, payoutsByWorkOrderId]);

  const counts = useMemo(() => {
    const c: Record<VendorPaymentBucket, number> = { pending: 0, paid: 0 };
    for (const row of ledgerRows) c[row.bucket] += 1;
    return c;
  }, [ledgerRows]);

  const tabs = useMemo(
    () =>
      PAY_LABELS.map(({ id, label }) => ({
        id,
        label,
        count: counts[id],
      })),
    [counts],
  );

  const rowsForBucket = useMemo(
    () => ledgerRows.filter((row) => row.bucket === bucket),
    [ledgerRows, bucket],
  );

  const filterRow = (
    <ManagerPortalFilterRow>
      <ManagerPortalStatusPills
        compact
        tabs={tabs}
        activeId={bucket}
        onChange={(id) => setBucket(id as VendorPaymentBucket)}
      />
    </ManagerPortalFilterRow>
  );

  return (
    <ManagerPortalPageShell
      title="Payments"
      titleAside={
        <Button
          type="button"
          variant="primary"
          className={PORTAL_HEADER_ACTION_BTN}
          onClick={() => setPaymentMethodsOpen(true)}
          data-attr="vendor-payments-add"
        >
          Payment methods
        </Button>
      }
      filterRow={filterRow}
    >
      {unlinked ? (
        <p
          className="mb-4 rounded-xl border px-4 py-3 text-sm portal-banner-pending"
          data-attr="vendor-payments-unlinked-banner"
        >
          Waiting on a property manager to connect with you — completed work will appear here once you&apos;re linked.
        </p>
      ) : null}

      {rowsForBucket.length === 0 ? (
        <PortalDataTableEmpty message="No payments in this bucket yet." icon="payment" />
      ) : (
        <>
          <div className="space-y-2 lg:hidden">
            {rowsForBucket.map((row) => {
              const expanded = expandedId === row.id;
              return (
                <div key={row.id} className={PORTAL_MOBILE_CARD_CLASS}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 text-left"
                    onClick={() => setExpandedId((cur) => (cur === row.id ? null : row.id))}
                    aria-expanded={expanded}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-foreground">{row.workOrderTitle}</p>
                      <p className="mt-0.5 truncate text-xs text-muted">{row.propertyName}</p>
                      <p className="mt-0.5 text-xs text-muted">{row.dateLabel}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <p className="text-base font-bold tabular-nums text-foreground">{row.amountLabel}</p>
                      {bucket !== "paid" ? (
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusTone(row.statusLabel)}`}
                        >
                          {row.statusLabel}
                        </span>
                      ) : null}
                      <PortalTableExpandChevron expanded={expanded} />
                    </div>
                  </button>
                  {expanded ? (
                    <VendorPaymentExpandedDetail
                      row={row}
                      workOrder={workOrderById.get(row.id)!}
                      vendorProfile={vendorProfile}
                      bucket={bucket}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className={`${PORTAL_DATA_TABLE_WRAP} hidden lg:block`}>
            <div className={PORTAL_DATA_TABLE_SCROLL}>
              <table className={PORTAL_DATA_TABLE}>
                <thead>
                  <tr className={PORTAL_TABLE_HEAD_ROW}>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Work order</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Property</th>
                    <th className={`${MANAGER_TABLE_TH} text-right`}>Amount</th>
                    {bucket !== "paid" ? (
                      <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
                    ) : null}
                    <th className={`${MANAGER_TABLE_TH} text-left`}>
                      {bucket === "paid" ? "Paid" : "Updated"}
                    </th>
                    <th className={PORTAL_TABLE_EXPAND_TH}>
                      <span className="sr-only">Expand</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rowsForBucket.map((row) => (
                    <Fragment key={row.id}>
                      <tr
                        className={PORTAL_TABLE_TR_EXPANDABLE}
                        onClick={createPortalRowExpandClick(() =>
                          setExpandedId((cur) => (cur === row.id ? null : row.id)),
                        )}
                        aria-expanded={expandedId === row.id}
                      >
                        <td className={`${PORTAL_TABLE_TD} font-medium text-foreground`}>{row.workOrderTitle}</td>
                        <td className={`${PORTAL_TABLE_TD} text-muted`}>{row.propertyName}</td>
                        <td className={`${PORTAL_TABLE_TD} text-right tabular-nums`}>{row.amountLabel}</td>
                        {bucket !== "paid" ? (
                          <td className={PORTAL_TABLE_TD}>
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusTone(row.statusLabel)}`}
                            >
                              {row.statusLabel}
                            </span>
                          </td>
                        ) : null}
                        <td className={`${PORTAL_TABLE_TD} text-muted`}>{row.dateLabel}</td>
                        <PortalTableExpandCell expanded={expandedId === row.id} />
                      </tr>
                      {expandedId === row.id ? (
                        <tr className={PORTAL_TABLE_DETAIL_ROW}>
                          <td colSpan={bucket === "paid" ? 5 : 6} className={PORTAL_TABLE_DETAIL_CELL}>
                            <VendorPaymentExpandedDetail
                              row={row}
                              workOrder={workOrderById.get(row.id)!}
                              vendorProfile={vendorProfile}
                              bucket={bucket}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      <VendorPaymentMethodsModal
        open={paymentMethodsOpen}
        onClose={() => setPaymentMethodsOpen(false)}
        profile={vendorProfile}
        onSaved={setVendorProfile}
      />
    </ManagerPortalPageShell>
  );
}
