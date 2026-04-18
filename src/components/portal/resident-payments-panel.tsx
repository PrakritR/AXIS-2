"use client";

import { Fragment, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { demoResidentChargeRows } from "@/data/demo-portal";
import { ManagerSectionShell } from "./manager-section-shell";

function statusClass(label: string) {
  const l = label.toLowerCase();
  if (l.includes("paid")) return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80";
  if (l.includes("partial")) return "bg-amber-50 text-amber-900 ring-1 ring-amber-200/80";
  if (l.includes("due")) return "bg-slate-100 text-slate-800 ring-1 ring-slate-200/80";
  return "bg-slate-100 text-slate-800 ring-1 ring-slate-200/80";
}

export function ResidentPaymentsPanel() {
  const { showToast } = useAppUi();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <ManagerSectionShell title="Payments" actions={[{ label: "Refresh", variant: "outline" }]}>
      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[720px] w-full border-collapse text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/90 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3">Charge</th>
                <th className="px-3 py-3">Amount due</th>
                <th className="px-3 py-3">Balance</th>
                <th className="px-3 py-3">Due date</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {demoResidentChargeRows.map((row) => (
                <Fragment key={row.id}>
                  <tr className="border-t border-slate-100 align-top">
                    <td className="px-3 py-3 font-medium text-slate-900">{row.title}</td>
                    <td className="px-3 py-3 tabular-nums text-slate-800">{row.amountDue}</td>
                    <td className="px-3 py-3 tabular-nums font-semibold text-slate-900">{row.balance}</td>
                    <td className="px-3 py-3 text-slate-600">{row.dueDate}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClass(row.statusLabel)}`}>
                        {row.statusLabel}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-full text-xs"
                          onClick={() => setExpandedId((cur) => (cur === row.id ? null : row.id))}
                        >
                          {expandedId === row.id ? "Hide" : "Details"}
                        </Button>
                        <Button
                          type="button"
                          className="rounded-full text-xs"
                          onClick={() => showToast("Redirecting to Stripe Checkout (demo).")}
                          disabled={row.balance === "$0.00"}
                        >
                          Pay by card
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === row.id ? (
                    <tr className="border-t border-slate-100 bg-slate-50/50">
                      <td colSpan={6} className="px-4 py-4 text-sm text-slate-700">
                        <p>
                          Line detail for <span className="font-semibold text-slate-900">{row.title}</span>. In production this row
                          opens Stripe Checkout for the outstanding balance only.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button type="button" variant="outline" className="rounded-full text-xs" onClick={() => showToast("Receipt emailed (demo).")}>
                            Email receipt
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
    </ManagerSectionShell>
  );
}
