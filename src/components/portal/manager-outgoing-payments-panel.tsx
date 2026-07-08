"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { ManagerOutgoingPaymentDetail } from "@/components/portal/manager-outgoing-payment-detail";
import {
  PORTAL_DETAIL_BTN,
  PortalDataTableEmpty,
  PortalTableDetailActions,
} from "@/components/portal/portal-data-table";
import { PortalPaymentsTable, type PortalPaymentTableRow } from "@/components/portal/portal-payments-table";
import type { DemoManagerOutgoingPaymentRow, DemoManagerWorkOrderRow, ManagerPaymentBucket } from "@/data/demo-portal";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import { deleteManagerOutgoingExpense } from "@/lib/manager-outgoing-payments";
import type { ManagerVendorRow } from "@/lib/manager-vendors-storage";
import { readManagerWorkOrderRows } from "@/lib/manager-work-orders-storage";

export function ManagerOutgoingPaymentsPanel({
  rows,
  activeBucket: _activeBucket,
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
  const [payModalRowId, setPayModalRowId] = useState<string | null>(null);

  const workOrderById = useMemo(() => {
    const map = new Map<string, DemoManagerWorkOrderRow>();
    for (const row of readManagerWorkOrderRows()) map.set(row.id, row);
    return map;
  }, [rows]);

  const rowById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);

  const tableRows = useMemo<PortalPaymentTableRow[]>(
    () =>
      rows.map((row) => ({
        id: row.id,
        charge: row.chargeTitle,
        property: row.propertyName,
        payee: row.payeeLabel,
        dueDate: row.dueDate,
        amount: row.amountLabel,
      })),
    [rows],
  );

  const deleteExpense = async (row: DemoManagerOutgoingPaymentRow) => {
    if (!row.expenseEntryId) {
      showToast("This payment cannot be deleted.");
      return;
    }
    if (row.fromAxisFee) return;
    if (row.workOrderId && !row.fromExpense) {
      showToast("Work-order expenses are managed from Services.");
      return;
    }
    if (!window.confirm(`Delete "${row.chargeTitle}"?`)) return;

    if (isDemoModeActive()) {
      if (!deleteManagerOutgoingExpense(row.expenseEntryId)) {
        showToast("Could not delete expense.");
        return;
      }
      setExpandedId(null);
      showToast("Expense removed.");
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
      deleteManagerOutgoingExpense(row.expenseEntryId);
      setExpandedId(null);
      showToast("Expense removed.");
      onRowsChanged?.();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not delete expense.");
    } finally {
      setDeletingId(null);
    }
  };

  const canDeleteExpense = (row: DemoManagerOutgoingPaymentRow) =>
    Boolean(row.fromExpense && row.expenseEntryId && !row.fromAxisFee);

  const isPayableWorkOrder = (row: DemoManagerOutgoingPaymentRow) =>
    Boolean(row.workOrderId && row.bucket !== "paid");

  const renderExpandedActions = (tr: PortalPaymentTableRow) => {
    const row = rowById.get(tr.id)!;
    const payable = isPayableWorkOrder(row);
    return (
      <PortalTableDetailActions>
        {payable ? (
          <Button
            type="button"
            variant="primary"
            className={PORTAL_DETAIL_BTN}
            data-attr="manager-outgoing-payment-mark-paid"
            onClick={(event) => {
              event.stopPropagation();
              setPayModalRowId(row.id);
            }}
          >
            Mark as paid
          </Button>
        ) : null}
        {canDeleteExpense(row) ? (
          <Button
            type="button"
            variant="outline"
            className={PORTAL_DETAIL_BTN}
            disabled={deletingId === row.id}
            data-attr="outgoing-payment-delete"
            onClick={(event) => {
              event.stopPropagation();
              void deleteExpense(row);
            }}
          >
            {deletingId === row.id ? "Deleting…" : "Delete"}
          </Button>
        ) : null}
      </PortalTableDetailActions>
    );
  };

  const renderExpandedDetail = (tr: PortalPaymentTableRow) => {
    const row = rowById.get(tr.id)!;
    const workOrder = row.workOrderId ? workOrderById.get(row.workOrderId) : undefined;
    const vendor = row.vendorId ? vendorById?.get(row.vendorId) : undefined;
    if (row.workOrderId) {
      return (
        <ManagerOutgoingPaymentDetail
          row={row}
          workOrder={workOrder}
          vendor={vendor}
          hideActionBar
          payModalOpen={payModalRowId === row.id}
          onPayModalOpenChange={(open) => {
            if (!open) setPayModalRowId(null);
          }}
          onPaid={() => {
            setPayModalRowId(null);
            setExpandedId(null);
            onRowsChanged?.();
          }}
          onDelete={canDeleteExpense(row) ? () => void deleteExpense(row) : undefined}
          deleteBusy={deletingId === row.id}
        />
      );
    }
    return (
      <p className="text-sm text-muted">
        Due: <span className="font-semibold text-foreground">{row.dueDate}</span>
        {" · "}
        Payee: <span className="font-semibold text-foreground">{row.payeeLabel}</span>
      </p>
    );
  };

  if (rows.length === 0) {
    return <PortalDataTableEmpty message="No outgoing payments in this bucket yet." icon="payment" />;
  }

  return (
    <PortalPaymentsTable
      rows={tableRows}
      expandedId={expandedId}
      onExpand={setExpandedId}
      renderExpandedActions={renderExpandedActions}
      renderExpandedDetail={renderExpandedDetail}
    />
  );
}
