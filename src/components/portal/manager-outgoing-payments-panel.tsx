"use client";

import { Fragment, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";
import {
  PORTAL_DATA_TABLE,
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PORTAL_DETAIL_BTN,
  PORTAL_DETAIL_BTN_PRIMARY,
  PORTAL_MOBILE_CARD_CLASS,
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
import type { DemoManagerOutgoingPaymentRow, DemoManagerWorkOrderRow, ManagerPaymentBucket } from "@/data/demo-portal";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import {
  readManagerWorkOrderRows,
  syncManagerWorkOrdersFromServer,
  updateManagerWorkOrder,
} from "@/lib/manager-work-orders-storage";
import { parseMoneyAmount } from "@/lib/parse-money";
import { parseWorkOrderCategoryFromDescription } from "@/lib/reports/formal-documents/spec";

const APPROVE_PAY_CONFIRM_THRESHOLD_CENTS = 50_000;

function approvePayDefaults(row: DemoManagerWorkOrderRow) {
  return {
    category: row.category ?? parseWorkOrderCategoryFromDescription(row.description),
    vendorCostCents: row.vendorCostCents ?? Math.round(parseMoneyAmount(row.cost) * 100),
    materialsCostCents: row.materialsCostCents ?? 0,
    materialsMemo: row.materialsMemo ?? "",
    workDoneSummary: row.workDoneSummary || row.vendorMarkedDoneNote || row.title,
  };
}

function statusTone(label: string) {
  const l = label.toLowerCase();
  if (l.includes("paid")) return "portal-badge-success ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";
  if (l.includes("overdue")) return "portal-badge-danger ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";
  if (l.includes("awaiting")) return "portal-badge-pending ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";
  return "bg-accent/30 text-foreground ring-1 ring-border";
}

function isPendingVendorPayment(row: DemoManagerOutgoingPaymentRow): boolean {
  return Boolean(row.workOrderId) && row.bucket !== "paid";
}

export function ManagerOutgoingPaymentsPanel({
  rows,
  activeBucket,
  onRowsChanged,
}: {
  rows: DemoManagerOutgoingPaymentRow[];
  activeBucket: ManagerPaymentBucket;
  onRowsChanged?: () => void;
}) {
  const { showToast } = useAppUi();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [approvePayRow, setApprovePayRow] = useState<DemoManagerWorkOrderRow | null>(null);
  const [approvePayBusy, setApprovePayBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const workOrderById = useMemo(() => {
    const map = new Map<string, DemoManagerWorkOrderRow>();
    for (const row of readManagerWorkOrderRows()) map.set(row.id, row);
    return map;
  }, [rows]);

  const submitApprovePay = async (row: DemoManagerWorkOrderRow) => {
    if (isDemoModeActive()) {
      updateManagerWorkOrder(row.id, (current) => ({
        ...current,
        automationStatus: "paid",
        paidAt: new Date().toISOString(),
      }));
      showToast("Approved and paid (demo).");
      setApprovePayRow(null);
      setExpandedId(null);
      onRowsChanged?.();
      return;
    }
    setApprovePayBusy(true);
    try {
      const res = await fetch("/api/portal/work-orders/approve-pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ workOrder: row, ...approvePayDefaults(row) }),
      });
      const data = (await res.json()) as { workOrder?: DemoManagerWorkOrderRow; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not approve payment.");
      if (data.workOrder) updateManagerWorkOrder(row.id, () => data.workOrder as DemoManagerWorkOrderRow);
      void syncManagerWorkOrdersFromServer();
      showToast("Approved and paid.");
      setApprovePayRow(null);
      setExpandedId(null);
      onRowsChanged?.();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not approve payment.");
    } finally {
      setApprovePayBusy(false);
    }
  };

  const approvePay = (ledgerRow: DemoManagerOutgoingPaymentRow) => {
    const workOrder = ledgerRow.workOrderId ? workOrderById.get(ledgerRow.workOrderId) : undefined;
    if (!workOrder) {
      showToast("Work order not found.");
      return;
    }
    const { vendorCostCents, materialsCostCents } = approvePayDefaults(workOrder);
    if (vendorCostCents + materialsCostCents < APPROVE_PAY_CONFIRM_THRESHOLD_CENTS) {
      void submitApprovePay(workOrder);
    } else {
      setApprovePayRow(workOrder);
    }
  };

  const deleteExpense = async (row: DemoManagerOutgoingPaymentRow) => {
    if (!row.expenseEntryId || row.fromAxisFee) return;
    if (row.workOrderId) {
      showToast("Work-order expenses are managed from Services.");
      return;
    }
    if (isDemoModeActive()) {
      showToast("Expense removed (demo).");
      onRowsChanged?.();
      return;
    }
    setDeletingId(row.id);
    try {
      const res = await fetch(`/api/expenses?id=${encodeURIComponent(row.expenseEntryId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not delete expense.");
      showToast("Expense removed.");
      onRowsChanged?.();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not delete expense.");
    } finally {
      setDeletingId(null);
    }
  };

  const renderDetailActions = (row: DemoManagerOutgoingPaymentRow) => (
    <PortalTableDetailActions>
      {isPendingVendorPayment(row) ? (
        <Button
          type="button"
          variant="outline"
          className={PORTAL_DETAIL_BTN_PRIMARY}
          disabled={approvePayBusy}
          data-attr="outgoing-payment-approve-pay"
          onClick={() => approvePay(row)}
        >
          {approvePayBusy ? "Approving…" : "Approve & pay"}
        </Button>
      ) : null}
      {row.fromExpense && !row.fromAxisFee && !row.workOrderId ? (
        <Button
          type="button"
          variant="outline"
          className={`${PORTAL_DETAIL_BTN} text-danger`}
          disabled={deletingId === row.id}
          data-attr="outgoing-payment-delete"
          onClick={() => void deleteExpense(row)}
        >
          {deletingId === row.id ? "Deleting…" : "Delete"}
        </Button>
      ) : null}
    </PortalTableDetailActions>
  );

  if (rows.length === 0) {
    return <PortalDataTableEmpty message="No outgoing payments in this bucket yet." icon="payment" />;
  }

  return (
    <>
      <div className="space-y-2 lg:hidden">
        {rows.map((row) => {
          const expanded = expandedId === row.id;
          return (
            <div key={row.id} className={PORTAL_MOBILE_CARD_CLASS}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 text-left"
                onClick={() => setExpandedId((cur) => (cur === row.id ? null : row.id))}
                aria-expanded={expanded}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-foreground">{row.chargeTitle}</p>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {row.categoryLabel} · {row.payeeLabel}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{row.propertyName}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <p className="text-base font-bold tabular-nums text-foreground">{row.amountLabel}</p>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusTone(row.statusLabel)}`}>
                    {row.statusLabel}
                  </span>
                  <PortalTableExpandChevron expanded={expanded} />
                </div>
              </button>
              {expanded ? <div className="mt-3 border-t border-border pt-3">{renderDetailActions(row)}</div> : null}
            </div>
          );
        })}
      </div>

      <div className={`${PORTAL_DATA_TABLE_WRAP} hidden lg:block`}>
        <div className={PORTAL_DATA_TABLE_SCROLL}>
          <table className={PORTAL_DATA_TABLE}>
            <thead>
              <tr className={PORTAL_TABLE_HEAD_ROW}>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Property</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Category</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Payee</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Description</th>
                <th className={`${MANAGER_TABLE_TH} text-right`}>Amount</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>{activeBucket === "paid" ? "Paid" : "Due"}</th>
                <th className={PORTAL_TABLE_EXPAND_TH}>
                  <span className="sr-only">Expand</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Fragment key={row.id}>
                  <tr
                    className={PORTAL_TABLE_TR_EXPANDABLE}
                    aria-expanded={expandedId === row.id}
                    onClick={createPortalRowExpandClick(() => setExpandedId((cur) => (cur === row.id ? null : row.id)))}
                  >
                    <td className={`${PORTAL_TABLE_TD} font-medium text-foreground`}>{row.propertyName}</td>
                    <td className={`${PORTAL_TABLE_TD} text-muted`}>{row.categoryLabel}</td>
                    <td className={`${PORTAL_TABLE_TD} text-muted`}>{row.payeeLabel}</td>
                    <td className={PORTAL_TABLE_TD}>{row.chargeTitle}</td>
                    <td className={`${PORTAL_TABLE_TD} text-right tabular-nums`}>{row.amountLabel}</td>
                    <td className={PORTAL_TABLE_TD}>
                      <div className="flex flex-col gap-1">
                        <span>{row.dueDate}</span>
                        <span className={`inline-flex w-fit rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusTone(row.statusLabel)}`}>
                          {row.statusLabel}
                        </span>
                      </div>
                    </td>
                    <PortalTableExpandCell expanded={expandedId === row.id} />
                  </tr>
                  {expandedId === row.id ? (
                    <tr className={PORTAL_TABLE_DETAIL_ROW}>
                      <td colSpan={7} className={PORTAL_TABLE_DETAIL_CELL}>
                        {renderDetailActions(row)}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={Boolean(approvePayRow)} onClose={() => setApprovePayRow(null)} title="Approve & pay">
        {approvePayRow ? (
          <div className="space-y-4 text-sm">
            <p>
              {approvePayRow.propertyName} · {approvePayRow.title}
            </p>
            <p className="text-muted">
              Total{" "}
              <span className="font-semibold text-foreground">
                $
                {(
                  (approvePayDefaults(approvePayRow).vendorCostCents + approvePayDefaults(approvePayRow).materialsCostCents) /
                  100
                ).toFixed(2)}
              </span>
              {approvePayRow.vendorName ? (
                <>
                  {" "}
                  to <span className="font-semibold">{approvePayRow.vendorName}</span>
                </>
              ) : null}
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setApprovePayRow(null)} disabled={approvePayBusy}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                data-attr="outgoing-payment-approve-pay-confirm"
                onClick={() => void submitApprovePay(approvePayRow)}
                disabled={approvePayBusy}
              >
                {approvePayBusy ? "Approving…" : "Approve & pay"}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
