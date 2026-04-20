"use client";

import { Fragment, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";
import type { ManagerPaymentBucket } from "@/data/demo-portal";
import { demoManagerPaymentLedgerRows } from "@/data/demo-portal";

function statusTone(label: string) {
  const l = label.toLowerCase();
  if (l.includes("paid")) return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80";
  if (l.includes("overdue") || l.includes("partial")) return "bg-rose-50 text-rose-800 ring-1 ring-rose-200/80";
  if (l.includes("soon")) return "bg-amber-50 text-amber-900 ring-1 ring-amber-200/80";
  return "bg-slate-100 text-slate-800 ring-1 ring-slate-200/80";
}

export function ManagerPaymentsLedgerPanel({ bucket }: { bucket: ManagerPaymentBucket }) {
  const { showToast } = useAppUi();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const rows = useMemo(() => demoManagerPaymentLedgerRows.filter((r) => r.bucket === bucket), [bucket]);

  if (rows.length === 0) {
    return (
      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white">
        <div className="flex flex-col items-center justify-center bg-slate-50/30 px-4 py-16 text-center sm:py-20">
          <p className="text-sm font-medium text-slate-500">
            {demoManagerPaymentLedgerRows.length === 0 ? "No payment lines yet (demo)." : "No rows in this bucket (demo)."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200/90 bg-white">
              <th className={`${MANAGER_TABLE_TH} text-left`}>Property</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Room</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Resident</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Charge</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Line amount</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Amount paid</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Balance due</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Due date</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
              <th className={`${MANAGER_TABLE_TH} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Fragment key={row.id}>
                <tr className="border-b border-slate-100 align-top last:border-0">
                  <td className="px-5 py-4 font-medium text-slate-900">{row.propertyName}</td>
                  <td className="px-5 py-4 text-slate-700">Room {row.roomNumber}</td>
                  <td className="px-5 py-4 text-slate-700">{row.residentName}</td>
                  <td className="px-5 py-4 text-slate-700">{row.chargeTitle}</td>
                  <td className="px-5 py-4 tabular-nums text-slate-800">{row.lineAmount}</td>
                  <td className="px-5 py-4 tabular-nums text-slate-700">{row.amountPaid}</td>
                  <td className="px-5 py-4 tabular-nums font-semibold text-slate-900">{row.balanceDue}</td>
                  <td className="px-5 py-4 text-slate-600">{row.dueDate}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusTone(row.statusLabel)}`}>
                      {row.statusLabel}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
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
                  <tr className="border-b border-slate-100 bg-slate-50/80 last:border-0">
                    <td colSpan={10} className="px-5 py-4">
                      <p className="text-sm text-slate-700">
                        <span className="font-semibold text-slate-900">{row.residentName}</span> · {row.notes}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-full !border-0 !bg-emerald-600 px-4 text-xs !text-white hover:!bg-emerald-700"
                          onClick={() => showToast("Marked paid (demo).")}
                        >
                          Mark paid
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-full border-slate-300 px-4 text-xs"
                          onClick={() => showToast("Moved to pending (demo).")}
                        >
                          Move to pending
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-full border-sky-300 px-4 text-xs text-sky-900 hover:bg-sky-50"
                          onClick={() => showToast("Recorded Zelle payment (demo).")}
                        >
                          Paid with Zelle
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-full border-rose-300 px-4 text-xs text-rose-800 hover:bg-rose-50"
                          onClick={() => showToast("Line removed (demo).")}
                        >
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
    </div>
  );
}
