"use client";

import { Fragment, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";
import type { ManagerWorkOrderBucket } from "@/data/demo-portal";
import { demoManagerWorkOrderRowsFull } from "@/data/demo-portal";

function priorityClass(p: string) {
  const x = p.toLowerCase();
  if (x === "high") return "bg-rose-50 text-rose-800 ring-1 ring-rose-200/80";
  if (x === "medium") return "bg-amber-50 text-amber-900 ring-1 ring-amber-200/80";
  return "bg-slate-100 text-slate-700 ring-1 ring-slate-200/80";
}

export function ManagerWorkOrdersPanel({ bucket }: { bucket: ManagerWorkOrderBucket }) {
  const { showToast } = useAppUi();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const rows = useMemo(() => demoManagerWorkOrderRowsFull.filter((r) => r.bucket === bucket), [bucket]);

  if (rows.length === 0) {
    return (
      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white">
        <div className="flex flex-col items-center justify-center bg-slate-50/30 px-4 py-16 text-center sm:py-20">
          <p className="text-sm font-medium text-slate-500">
            {demoManagerWorkOrderRowsFull.length === 0 ? "No work orders yet (demo)." : "No work orders in this bucket (demo)."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-[720px] w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200/90 bg-white">
              <th className={`${MANAGER_TABLE_TH} text-left`}>ID</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Property</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Unit</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Title</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Priority</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
              <th className={`${MANAGER_TABLE_TH} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Fragment key={row.id}>
                <tr className="border-b border-slate-100 align-top last:border-0">
                  <td className="px-5 py-4 font-mono text-xs text-slate-800">{row.id}</td>
                  <td className="px-5 py-4 text-slate-700">{row.propertyName}</td>
                  <td className="px-5 py-4 text-slate-700">{row.unit}</td>
                  <td className="px-5 py-4 font-medium text-slate-900">{row.title}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${priorityClass(row.priority)}`}>
                      {row.priority}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-slate-700">{row.status}</td>
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
                    <td colSpan={7} className="px-5 py-4">
                      <p className="text-sm text-slate-700">{row.description}</p>
                      <p className="mt-2 text-xs text-slate-500">
                        Scheduled: <span className="font-medium text-slate-800">{row.scheduled}</span> · Cost:{" "}
                        <span className="font-medium text-slate-800">{row.cost}</span>
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button type="button" className="rounded-full text-xs" onClick={() => showToast("Visit scheduled (demo).")}>
                          Schedule visit
                        </Button>
                        <Button type="button" variant="outline" className="rounded-full text-xs" onClick={() => showToast("Cost logged (demo).")}>
                          Add cost
                        </Button>
                        <Button type="button" variant="outline" className="rounded-full text-xs" onClick={() => showToast("Marked complete (demo).")}>
                          Mark complete
                        </Button>
                        <Button type="button" variant="outline" className="rounded-full text-xs" onClick={() => showToast("Resident charge draft (demo).")}>
                          Create charge
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
