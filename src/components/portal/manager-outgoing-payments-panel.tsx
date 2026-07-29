"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { ManagerOutgoingPaymentDetail } from "@/components/portal/manager-outgoing-payment-detail";
import {
  PORTAL_DETAIL_BTN,
  PortalDataTableEmpty,
  PortalTableDetailActions,
} from "@/components/portal/portal-data-table";
import {
  PortalDetailHeader,
  PortalListDetailPane,
  PortalListDetailPlaceholder,
  portalUsesDesktopSplit,
} from "@/components/portal/portal-list-detail-shell";
import { INBOX_LIST_SCROLL } from "@/components/portal/portal-inbox-ui";
import { PortalPersonRecordRow } from "@/components/portal/portal-record-row";
import type { DemoManagerOutgoingPaymentRow, DemoManagerWorkOrderRow, ManagerPaymentBucket } from "@/data/demo-portal";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import { deleteManagerOutgoingExpense } from "@/lib/manager-outgoing-payments";
import type { ManagerVendorRow } from "@/lib/manager-vendors-storage";
import { readManagerWorkOrderRows } from "@/lib/manager-work-orders-storage";
import { paymentDetailHref, paymentListHref } from "@/lib/portal-detail-routes";
import { usePortalNavigate } from "@/lib/portal-nav-client";

export function ManagerOutgoingPaymentsPanel({
  rows,
  activeBucket,
  vendorById,
  onRowsChanged,
  paymentId: paymentIdProp,
  listBasePath,
}: {
  rows: DemoManagerOutgoingPaymentRow[];
  activeBucket: ManagerPaymentBucket;
  vendorById?: Map<string, ManagerVendorRow>;
  onRowsChanged?: () => void;
  paymentId?: string;
  listBasePath?: string;
}) {
  const { showToast } = useAppUi();
  const navigate = usePortalNavigate();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [payModalRowId, setPayModalRowId] = useState<string | null>(null);

  const workOrderById = useMemo(() => {
    const map = new Map<string, DemoManagerWorkOrderRow>();
    for (const row of readManagerWorkOrderRows()) map.set(row.id, row);
    return map;
  }, [rows]);

  const rowById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  const selectedRow = useMemo(
    () => rows.find((row) => row.id === expandedId) ?? null,
    [rows, expandedId],
  );

  const navigateToList = useCallback(() => {
    if (!listBasePath) return;
    navigate(paymentListHref(listBasePath, "outgoing", activeBucket));
  }, [activeBucket, listBasePath, navigate]);

  const openPaymentDetail = useCallback(
    (row: DemoManagerOutgoingPaymentRow) => {
      setExpandedId(row.id);
      setMobileDetailOpen(true);
      if (listBasePath) {
        navigate(paymentDetailHref(listBasePath, "outgoing", activeBucket, row.id));
      }
    },
    [activeBucket, listBasePath, navigate],
  );

  useEffect(() => {
    if (!paymentIdProp) return;
    const decoded = decodeURIComponent(paymentIdProp);
    if (rows.some((row) => row.id === decoded)) {
      setExpandedId(decoded);
      setMobileDetailOpen(true);
    }
  }, [paymentIdProp, rows]);

  useEffect(() => {
    if (rows.length === 0) {
      setExpandedId(null);
      setMobileDetailOpen(false);
      return;
    }
    setExpandedId((cur) => {
      if (cur && rows.some((row) => row.id === cur)) return cur;
      if (portalUsesDesktopSplit()) return rows[0]!.id;
      return null;
    });
  }, [rows]);

  useEffect(() => {
    setMobileDetailOpen(false);
    if (!portalUsesDesktopSplit()) setExpandedId(null);
  }, [activeBucket]);

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
      setMobileDetailOpen(false);
      navigateToList();
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
      setMobileDetailOpen(false);
      navigateToList();
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

  const renderHeaderActions = (row: DemoManagerOutgoingPaymentRow) => {
    const payable = isPayableWorkOrder(row);
    return (
      <PortalTableDetailActions>
        {payable ? (
          <Button
            type="button"
            variant="primary"
            className={PORTAL_DETAIL_BTN}
            data-attr="manager-outgoing-payment-mark-paid"
            onClick={() => setPayModalRowId(row.id)}
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
            onClick={() => void deleteExpense(row)}
          >
            {deletingId === row.id ? "Deleting…" : "Delete"}
          </Button>
        ) : null}
      </PortalTableDetailActions>
    );
  };

  const renderDetailBody = (row: DemoManagerOutgoingPaymentRow) => {
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
            setMobileDetailOpen(false);
            navigateToList();
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
    <PortalListDetailPane
      mobileCompact
      className="max-md:rounded-xl max-md:shadow-[var(--shadow-sm)]"
      detailOpen={mobileDetailOpen && Boolean(selectedRow)}
      list={
        <div className={INBOX_LIST_SCROLL}>
          {rows.map((row) => (
            <PortalPersonRecordRow
              key={row.id}
              name={row.chargeTitle}
              subtitle={row.propertyName}
              preview={row.payeeLabel}
              meta={row.amountLabel}
              selected={expandedId === row.id}
              onOpen={() => openPaymentDetail(row)}
              dataAttr="outgoing-payment-list-row"
            />
          ))}
        </div>
      }
      detail={
        selectedRow ? (
          <div className="flex h-full min-h-0 flex-col">
            <PortalDetailHeader
              title={selectedRow.chargeTitle}
              subtitle={selectedRow.payeeLabel}
              onBack={() => {
                setMobileDetailOpen(false);
                navigateToList();
              }}
              backLabel="Back to payments"
              dataAttrBack="outgoing-payment-detail-back"
              actions={renderHeaderActions(selectedRow)}
            />
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2 [-webkit-overflow-scrolling:touch] md:px-3 md:py-3">
              {renderDetailBody(selectedRow)}
            </div>
          </div>
        ) : (
          <PortalListDetailPlaceholder
            title="Select an expense"
            hint="Choose an outgoing payment from the list to review or mark paid."
          />
        )
      }
    />
  );
}
