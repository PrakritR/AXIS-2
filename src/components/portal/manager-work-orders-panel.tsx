"use client";

import { Fragment, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { PortalPanelTabs } from "@/components/portal/panel-tab-strip";
import type { ManagerWorkOrderBucket } from "@/data/demo-portal";
import { demoManagerWorkOrderRowsFull } from "@/data/demo-portal";

const WO_TABS: { id: ManagerWorkOrderBucket; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "scheduled", label: "Scheduled" },
  { id: "completed", label: "Completed" },
];

function priorityClass(p: string) {
  const x = p.toLowerCase();
  if (x === "high") return "bg-rose-50 text-rose-800 ring-1 ring-rose-200/80";
  if (x === "medium") return "bg-amber-50 text-amber-900 ring-1 ring-amber-200/80";
  return "bg-slate-100 text-slate-700 ring-1 ring-slate-200/80";
}

export function ManagerWorkOrdersPanel() {
  const { showToast } = useAppUi();
  const [bucket, setBucket] = useState<ManagerWorkOrderBucket>("open");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const rows = useMemo(() => demoManagerWorkOrderRowsFull.filter((r) => r.bucket === bucket), [bucket]);

  return (
    <>
      <PortalPanelTabs ariaLabel="Work order status" tabs={WO_TABS} active={bucket} onChange={(id) => setBucket(id as ManagerWorkOrderBucket)} />

      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[720px] w-full border-collapse text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/90 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Property</th>
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Fragment key={row.id}>
                  <tr className="border-t border-slate-100 align-top">
                    <td className="px-4 py-3 font-mono text-xs text-slate-800">{row.id}</td>
                    <td className="px-4 py-3 text-slate-700">{row.propertyName}</td>
                    <td className="px-4 py-3 text-slate-700">{row.unit}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{row.title}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${priorityClass(row.priority)}`}>
                        {row.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{row.status}</td>
                    <td className="px-4 py-3 text-right">
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
                      <td colSpan={7} className="px-4 py-4">
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
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">No work orders in this bucket (demo).</p>
        ) : null}
      </div>
    </>
  );
}
