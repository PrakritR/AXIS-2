"use client";

import { Fragment, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { PortalPanelTabs } from "@/components/portal/panel-tab-strip";
import type { ManagerLeaseBucket } from "@/data/demo-portal";
import { demoManagerLeaseDraftRows } from "@/data/demo-portal";

const LEASE_TABS: { id: ManagerLeaseBucket; label: string }[] = [
  { id: "manager", label: "Manager review" },
  { id: "admin", label: "Admin review" },
  { id: "resident", label: "With resident" },
  { id: "signed", label: "Signed" },
];

export function ManagerLeasesPipelinePanel() {
  const { showToast } = useAppUi();
  const [bucket, setBucket] = useState<ManagerLeaseBucket>("manager");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const rows = useMemo(() => demoManagerLeaseDraftRows.filter((r) => r.bucket === bucket), [bucket]);

  return (
    <>
      <PortalPanelTabs ariaLabel="Lease pipeline" tabs={LEASE_TABS} active={bucket} onChange={(id) => setBucket(id as ManagerLeaseBucket)} />

      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[640px] w-full border-collapse text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/90 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Resident</th>
                <th className="px-4 py-3">Unit / home</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Fragment key={row.id}>
                  <tr className="border-t border-slate-100 align-top">
                    <td className="px-4 py-3 font-medium text-slate-900">{row.resident}</td>
                    <td className="px-4 py-3 text-slate-700">{row.unit}</td>
                    <td className="px-4 py-3 text-slate-700">{row.stageLabel}</td>
                    <td className="px-4 py-3 text-slate-600">{row.updated}</td>
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
                      <td colSpan={5} className="px-4 py-4">
                        <p className="text-sm text-slate-700">{row.notes}</p>
                        <p className="mt-2 text-xs text-slate-500">PDF version: {row.pdfVersion}</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button type="button" className="rounded-full text-xs" onClick={() => showToast("Lease PDF generated (demo).")}>
                            Generate PDF
                          </Button>
                          <Button type="button" variant="outline" className="rounded-full text-xs" onClick={() => showToast("Marked signed (demo).")}>
                            Mark signed
                          </Button>
                          <Button type="button" variant="outline" className="rounded-full text-xs" onClick={() => showToast("Edit request sent (demo).")}>
                            Request edits from resident
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
          <p className="px-4 py-8 text-center text-sm text-slate-500">No drafts in this stage (demo).</p>
        ) : null}
      </div>
    </>
  );
}
