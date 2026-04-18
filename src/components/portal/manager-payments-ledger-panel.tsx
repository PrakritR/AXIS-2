"use client";

import { Fragment, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { PortalPanelTabs } from "@/components/portal/panel-tab-strip";
import type { ManagerPaymentBucket } from "@/data/demo-portal";
import { demoManagerPaymentLedgerRows } from "@/data/demo-portal";

const PAY_TABS: { id: ManagerPaymentBucket; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "overdue", label: "Overdue" },
  { id: "paid", label: "Paid" },
];

function statusTone(label: string) {
  const l = label.toLowerCase();
  if (l.includes("paid")) return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80";
  if (l.includes("overdue") || l.includes("partial")) return "bg-rose-50 text-rose-800 ring-1 ring-rose-200/80";
  if (l.includes("soon")) return "bg-amber-50 text-amber-900 ring-1 ring-amber-200/80";
  return "bg-slate-100 text-slate-800 ring-1 ring-slate-200/80";
}

export function ManagerPaymentsLedgerPanel() {
  const { showToast } = useAppUi();
  const [bucket, setBucket] = useState<ManagerPaymentBucket>("pending");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const rows = useMemo(() => demoManagerPaymentLedgerRows.filter((r) => r.bucket === bucket), [bucket]);

  return (
    <>
      <PortalPanelTabs ariaLabel="Payment status" tabs={PAY_TABS} active={bucket} onChange={(id) => setBucket(id as ManagerPaymentBucket)} />

      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full border-collapse text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/90 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3">Property</th>
                <th className="px-3 py-3">Room</th>
                <th className="px-3 py-3">Resident</th>
                <th className="px-3 py-3">Charge</th>
                <th className="px-3 py-3">Line amount</th>
                <th className="px-3 py-3">Amount paid</th>
                <th className="px-3 py-3">Balance due</th>
                <th className="px-3 py-3">Due date</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Fragment key={row.id}>
                  <tr className="border-t border-slate-100 align-top">
                    <td className="px-3 py-3 font-medium text-slate-900">{row.propertyName}</td>
                    <td className="px-3 py-3 text-slate-700">Room {row.roomNumber}</td>
                    <td className="px-3 py-3 text-slate-700">{row.residentName}</td>
                    <td className="px-3 py-3 text-slate-700">{row.chargeTitle}</td>
                    <td className="px-3 py-3 tabular-nums text-slate-800">{row.lineAmount}</td>
                    <td className="px-3 py-3 tabular-nums text-slate-700">{row.amountPaid}</td>
                    <td className="px-3 py-3 tabular-nums font-semibold text-slate-900">{row.balanceDue}</td>
                    <td className="px-3 py-3 text-slate-600">{row.dueDate}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusTone(row.statusLabel)}`}>
                        {row.statusLabel}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full text-xs"
                        onClick={() => setExpandedId((cur) => (cur === row.id ? null : row.id))}
                      >
                        {expandedId === row.id ? "Hide" : "Details"}
                      </Button>
                    </td>
                  </tr>
                  {expandedId === row.id ? (
                    <tr className="border-t border-slate-100 bg-slate-50/80">
                      <td colSpan={10} className="px-4 py-4">
                        <p className="text-sm text-slate-700">
                          <span className="font-semibold text-slate-900">{row.residentName}</span> · {row.notes}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button type="button" className="rounded-full text-xs" onClick={() => showToast("Marked paid (demo).")}>
                            Mark paid
                          </Button>
                          <Button type="button" variant="outline" className="rounded-full text-xs" onClick={() => showToast("Moved to pending (demo).")}>
                            Move to pending
                          </Button>
                          <Button type="button" variant="outline" className="rounded-full text-xs" onClick={() => showToast("Recorded Zelle payment (demo).")}>
                            Paid with Zelle
                          </Button>
                          <Button type="button" variant="outline" className="rounded-full text-xs" onClick={() => showToast("Line removed (demo).")}>
                            Delete line
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">No rows in this bucket (demo).</p>
        ) : null}
      </div>
    </>
  );
}
