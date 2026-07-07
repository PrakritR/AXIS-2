"use client";

import { Fragment, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";
import { ManagerOutgoingPaymentDetail } from "@/components/portal/manager-outgoing-payment-detail";
import {
  PORTAL_DATA_TABLE,
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PORTAL_DETAIL_BTN,
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
import type { ManagerVendorRow } from "@/lib/manager-vendors-storage";
import { readManagerWorkOrderRows } from "@/lib/manager-work-orders-storage";

function statusTone(label: string) {
  const l = label.toLowerCase();
  if (l.includes("paid")) return "portal-badge-success ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";
  if (l.includes("overdue")) return "portal-badge-danger ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";
  if (l.includes("awaiting")) return "portal-badge-pending ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";
  return "bg-accent/30 text-foreground ring-1 ring-border";
}

export function ManagerOutgoingPaymentsPanel({
  rows,
  activeBucket,
  vendorById,
  onRowsChanged,
}: {
  rows: DemoManagerOutgoingPaymentRow[];
  activeBucket: ManagerPaymentBucket;
  vendorById?: Map<string, ManagerVendorRow>;
  onRowsChanged?: () => void;
}) {
  const { showToast } = useAppUi();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const workOrderById = useMemo(() => {
    const map = new Map<string, DemoManagerWorkOrderRow>();
    for (const row of readManagerWorkOrderRows()) map.set(row.id, row);
    return map;
  }, [rows]);

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

  const renderExpenseActions = (row: DemoManagerOutgoingPaymentRow) => (
    <PortalTableDetailActions>
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

  const renderDetail = (row: DemoManagerOutgoingPaymentRow) => {
    const workOrder = row.workOrderId ? workOrderById.get(row.workOrderId) : undefined;
    const vendor = row.vendorId ? vendorById?.get(row.vendorId) : undefined;
    if (row.workOrderId) {
      return (
        <ManagerOutgoingPaymentDetail
          row={row}
          workOrder={workOrder}
          vendor={vendor}
          onPaid={() => {
            setExpandedId(null);
            onRowsChanged?.();
          }}
        />
      );
    }
    return (
      <>
        <p className="mb-3 text-sm text-muted">
          Due: <span className="font-semibold text-foreground">{row.dueDate}</span>
          {" · "}
          Payee: <span className="font-semibold text-foreground">{row.payeeLabel}</span>
        </p>
        {renderExpenseActions(row)}
      </>
    );
  };

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
              {expanded ? <div className="mt-3 border-t border-border pt-3">{renderDetail(row)}</div> : null}
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
                        {renderDetail(row)}
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
  );
}
