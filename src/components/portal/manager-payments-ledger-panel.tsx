"use client";

import { Fragment, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";
import {
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PortalDataTableEmpty,
  PORTAL_DETAIL_BTN,
  PORTAL_DETAIL_BTN_PRIMARY,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_ROW_TOGGLE_CLASS,
  PORTAL_TABLE_TR,
  PORTAL_TABLE_TD,
  PortalTableDetailActions,
} from "@/components/portal/portal-data-table";
import type { DemoManagerPaymentLedgerRow, ManagerPaymentBucket } from "@/data/demo-portal";
import { deleteManagerPaymentLedgerEntry, markManagerPaymentLedgerPaid } from "@/lib/demo-manager-payment-ledger";
import { deleteHouseholdCharge, markHouseholdChargePaid } from "@/lib/household-charges";

function statusTone(label: string) {
  const l = label.toLowerCase();
  if (l.includes("paid")) return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80";
  if (l.includes("overdue") || l.includes("partial")) return "bg-rose-50 text-rose-800 ring-1 ring-rose-200/80";
  if (l.includes("soon")) return "bg-amber-50 text-amber-900 ring-1 ring-amber-200/80";
  return "bg-slate-100 text-slate-800 ring-1 ring-slate-200/80";
}

export function ManagerPaymentsLedgerPanel({
  rows,
  managerUserId,
  activeBucket,
  onRowsChanged,
}: {
  rows: DemoManagerPaymentLedgerRow[];
  managerUserId: string | null;
  activeBucket: ManagerPaymentBucket;
  onRowsChanged?: () => void;
}) {
  const { showToast } = useAppUi();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const hasAnySource = useMemo(() => rows.length > 0, [rows]);

  if (!hasAnySource) {
    return <PortalDataTableEmpty message="No payment lines in this bucket." />;
  }

  const removePayment = (row: DemoManagerPaymentLedgerRow) => {
    if (row.householdChargeId) {
      if (deleteHouseholdCharge(row.householdChargeId, managerUserId)) {
        showToast("Payment removed.");
        setExpandedId(null);
        onRowsChanged?.();
        return;
      }
      showToast("Could not remove this line.");
      return;
    }
    if (deleteManagerPaymentLedgerEntry(row.id)) {
      showToast("Payment removed.");
      setExpandedId(null);
      onRowsChanged?.();
      return;
    }
    showToast("Could not remove this line.");
  };

  const recordPaid = (row: DemoManagerPaymentLedgerRow, toastMessage: string) => {
    if (row.householdChargeId) {
      if (markHouseholdChargePaid(row.householdChargeId, managerUserId)) {
        showToast(toastMessage);
        setExpandedId(null);
        onRowsChanged?.();
        return;
      }
      showToast("Could not update this line.");
      return;
    }
    markManagerPaymentLedgerPaid(row.id);
    showToast(toastMessage);
    setExpandedId(null);
    onRowsChanged?.();
  };

  return (
    <div className={PORTAL_DATA_TABLE_WRAP}>
      <div className={PORTAL_DATA_TABLE_SCROLL}>
        <table className="min-w-[880px] w-full border-collapse text-left text-sm">
          <thead>
            <tr className={PORTAL_TABLE_HEAD_ROW}>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Property</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Room</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Resident</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Charge</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Amount paid</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Amount owed</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Due date</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
              <th className={`${MANAGER_TABLE_TH} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Fragment key={row.id}>
                <tr className={PORTAL_TABLE_TR}>
                  <td className={`${PORTAL_TABLE_TD} font-medium text-slate-900`}>{row.propertyName}</td>
                  <td className={PORTAL_TABLE_TD}>Room {row.roomNumber}</td>
                  <td className={PORTAL_TABLE_TD}>{row.residentName}</td>
                  <td className={PORTAL_TABLE_TD}>{row.chargeTitle}</td>
                  <td className={`${PORTAL_TABLE_TD} tabular-nums text-slate-700`}>{row.amountPaid}</td>
                  <td className={`${PORTAL_TABLE_TD} tabular-nums font-semibold text-slate-900`}>{row.balanceDue}</td>
                  <td className={`${PORTAL_TABLE_TD} text-slate-600`}>{row.dueDate}</td>
                  <td className={PORTAL_TABLE_TD}>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusTone(row.statusLabel)}`}>
                      {row.statusLabel}
                    </span>
                  </td>
                  <td className={`${PORTAL_TABLE_TD} text-right`}>
                    <Button
                      type="button"
                      variant="outline"
                      className={PORTAL_TABLE_ROW_TOGGLE_CLASS}
                      onClick={() => setExpandedId((cur) => (cur === row.id ? null : row.id))}
                    >
                      {expandedId === row.id ? "Hide" : "Details"}
                    </Button>
                  </td>
                </tr>
                {expandedId === row.id ? (
                  <tr className={PORTAL_TABLE_DETAIL_ROW}>
                    <td colSpan={9} className={PORTAL_TABLE_DETAIL_CELL}>
                      <p className="text-sm leading-relaxed text-slate-600">
                        <span className="font-medium text-slate-800">{row.residentName}</span> · {row.notes}
                      </p>
                      <PortalTableDetailActions>
                        {row.statusLabel !== "Paid" && row.balanceDue !== "$0.00" ? (
                          <>
                            <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN_PRIMARY} onClick={() => recordPaid(row, "Marked as paid.")}>
                              Mark as paid
                            </Button>
                            <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => recordPaid(row, "Recorded as paid with Zelle.")}>
                              Paid with Zelle
                            </Button>
                            <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => recordPaid(row, "Recorded as paid with Venmo.")}>
                              Paid with Venmo
                            </Button>
                          </>
                        ) : null}
                        {activeBucket !== "pending" ? (
                          <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => showToast("Moved to pending.")}>
                            Move to pending
                          </Button>
                        ) : null}
                        <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => removePayment(row)}>
                          Delete
                        </Button>
                      </PortalTableDetailActions>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
