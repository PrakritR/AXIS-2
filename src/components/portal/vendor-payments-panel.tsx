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
  PORTAL_MOBILE_CARD_CLASS,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TD,
  PORTAL_TABLE_TR_EXPANDABLE,
  PortalDataTableEmpty,
  createPortalRowExpandClick,
} from "@/components/portal/portal-data-table";
import { PortalStripeConnectPanel } from "@/components/portal/portal-stripe-connect-panel";
import { useAppUi } from "@/components/providers/app-ui-provider";
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import {
  MANAGER_WORK_ORDERS_EVENT,
  readVendorWorkOrderRows,
  syncManagerWorkOrdersFromServer,
} from "@/lib/manager-work-orders-storage";
import { safeFormatDateTime } from "@/lib/pacific-time";
import { fetchVendorPayoutsResult, type VendorPayout } from "@/lib/vendor-payouts";

type VendorPaymentBucket = "pending" | "overdue" | "paid";

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
  { id: "overdue", label: "Overdue" },
  { id: "paid", label: "Paid" },
];

const OVERDUE_AFTER_DAYS = 14;

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

function daysSince(iso: string | undefined): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 86_400_000);
}

function vendorPaymentBucket(row: DemoManagerWorkOrderRow): VendorPaymentBucket | null {
  if (row.automationStatus === "paid") return "paid";
  if (row.bucket !== "completed" && row.automationStatus !== "vendor_marked_done") return null;

  const anchor = row.vendorMarkedDoneAt ?? row.completedAt;
  const elapsed = daysSince(anchor);
  if (elapsed !== null && elapsed >= OVERDUE_AFTER_DAYS) return "overdue";
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
  } else if (bucket === "overdue") {
    statusLabel = "Overdue";
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

/** Vendor Payments — payout history from completed work orders + Stripe Connect bank linking. */
export function VendorPaymentsPanel() {
  const { showToast } = useAppUi();
  const demo = isDemoModeActive();

  const [bucket, setBucket] = useState<VendorPaymentBucket>("pending");
  const [tick, setTick] = useState(0);
  const [payoutsByWorkOrderId, setPayoutsByWorkOrderId] = useState<Record<string, VendorPayout>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [unlinked, setUnlinked] = useState(false);

  const loadPayouts = useCallback(async () => {
    if (demo) return;
    const result = await fetchVendorPayoutsResult();
    if (!result.ok) return;
    setPayoutsByWorkOrderId(Object.fromEntries(result.payouts.map((p) => [p.workOrderId, p])));
  }, [demo]);

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
      .then((data: { linked?: boolean }) => setUnlinked(data.linked === false))
      .catch(() => undefined);
  }, [demo]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const connect = new URLSearchParams(window.location.search).get("connect");
    if (connect === "done") {
      showToast("Bank account linked.");
    } else if (connect === "refresh") {
      showToast("Setup link expired — try Link bank again.");
    }
  }, [showToast]);

  const ledgerRows = useMemo(() => {
    void tick;
    return readVendorWorkOrderRows()
      .map((row) => toLedgerRow(row, payoutsByWorkOrderId[row.id]))
      .filter((row): row is VendorPaymentLedgerRow => row !== null);
  }, [tick, payoutsByWorkOrderId]);

  const counts = useMemo(() => {
    const c: Record<VendorPaymentBucket, number> = { pending: 0, overdue: 0, paid: 0 };
    for (const row of ledgerRows) c[row.bucket] += 1;
    return c;
  }, [ledgerRows]);

  const tabs = useMemo(
    () =>
      PAY_LABELS.map(({ id, label }) => ({
        id,
        label,
        count: counts[id],
        alert: id === "overdue" && counts.overdue > 0,
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
        <div className="flex min-w-0 flex-col items-stretch gap-2">
          <div className="flex items-center justify-end gap-2">
            <PortalStripeConnectPanel
              basePath="/vendor"
              apiBase="/api/vendor/stripe-connect"
              returnPath="/vendor/payments"
              dataAttrPrefix="vendor-stripe-connect"
              variant="header"
            />
            <Button
              type="button"
              variant="primary"
              className={PORTAL_HEADER_ACTION_BTN}
              onClick={() =>
                showToast("Payments are created when a manager approves completed work orders.")
              }
              data-attr="vendor-payments-add"
            >
              Add
            </Button>
          </div>
        </div>
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
                    className="flex w-full items-start justify-between gap-3 text-left"
                    onClick={() => setExpandedId((cur) => (cur === row.id ? null : row.id))}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-foreground">{row.workOrderTitle}</p>
                      <p className="mt-0.5 truncate text-xs text-muted">{row.propertyName}</p>
                      <p className="mt-0.5 text-xs text-muted">{row.dateLabel}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-base font-bold tabular-nums text-foreground">{row.amountLabel}</p>
                      <span
                        className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusTone(row.statusLabel)}`}
                      >
                        {row.statusLabel}
                      </span>
                    </div>
                  </button>
                  {expanded && row.payoutFailureReason ? (
                    <p className="mt-3 border-t border-border pt-3 text-xs text-muted">{row.payoutFailureReason}</p>
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
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>
                      {bucket === "paid" ? "Paid" : "Updated"}
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
                        <td className={PORTAL_TABLE_TD}>
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusTone(row.statusLabel)}`}
                          >
                            {row.statusLabel}
                          </span>
                        </td>
                        <td className={`${PORTAL_TABLE_TD} text-muted`}>{row.dateLabel}</td>
                      </tr>
                      {expandedId === row.id && row.payoutFailureReason ? (
                        <tr>
                          <td colSpan={5} className="border-b border-border px-4 py-3 text-xs text-muted">
                            {row.payoutFailureReason}
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
    </ManagerPortalPageShell>
  );
}
