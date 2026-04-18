"use client";

import { Fragment, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { PortalPanelTabs } from "@/components/portal/panel-tab-strip";
import type { ManagerHouseBucket } from "@/data/demo-portal";
import { demoManagerHouseRows } from "@/data/demo-portal";

const BUCKET_TABS: { id: ManagerHouseBucket; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "change", label: "Request change" },
  { id: "listed", label: "Listed" },
  { id: "unlisted", label: "Unlisted" },
  { id: "rejected", label: "Rejected" },
];

function statusLabel(bucket: ManagerHouseBucket): string {
  switch (bucket) {
    case "pending":
      return "Pending";
    case "change":
      return "Changes requested";
    case "listed":
      return "Live";
    case "unlisted":
      return "Unlisted";
    case "rejected":
      return "Rejected";
    default:
      return "—";
  }
}

export function ManagerHousePropertiesPanel() {
  const [bucket, setBucket] = useState<ManagerHouseBucket>("listed");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const rows = useMemo(() => demoManagerHouseRows.filter((r) => r.bucket === bucket), [bucket]);

  return (
    <>
      <PortalPanelTabs ariaLabel="Property status" tabs={BUCKET_TABS} active={bucket} onChange={(id) => setBucket(id as ManagerHouseBucket)} />

      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[720px] w-full border-collapse text-left text-sm">
            <colgroup>
              <col style={{ width: "28%" }} />
              <col style={{ width: "42%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "14%" }} />
            </colgroup>
            <thead className="border-b border-slate-200 bg-slate-50/90 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Property</th>
                <th className="px-4 py-3">Summary</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <Fragment key={p.id}>
                  <tr className="border-t border-slate-100 align-top">
                    <td className="px-4 py-4">
                      <p className="font-semibold text-slate-900">{p.name}</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-500">{p.address}</p>
                    </td>
                    <td className="px-4 py-4">
                      <span className="inline-flex rounded-full bg-primary/[0.08] px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                        {p.propertyType}
                      </span>
                      <p className="mt-2 text-xs text-slate-600">
                        <span className="font-medium text-slate-800">{p.roomCount}</span> rooms ·{" "}
                        <span className="font-medium text-slate-800">{p.bathCount}</span> baths · App fee{" "}
                        <span className="font-medium text-slate-800">{p.appFee}</span>
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-800">
                        {statusLabel(p.bucket)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full text-xs"
                        onClick={() => setExpandedId((cur) => (cur === p.id ? null : p.id))}
                      >
                        {expandedId === p.id ? "Hide" : "Details"}
                      </Button>
                    </td>
                  </tr>
                  {expandedId === p.id ? (
                    <tr className="border-t border-slate-100 bg-slate-50/70">
                      <td colSpan={4} className="px-4 py-4">
                        <p className="text-sm text-slate-700">{p.detail}</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button type="button" className="rounded-full text-xs" variant="outline">
                            Edit listing
                          </Button>
                          <Button type="button" className="rounded-full text-xs" variant="outline">
                            Unlist / relist
                          </Button>
                          <Button type="button" className="rounded-full text-xs" variant="outline">
                            Delete (demo)
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
          <p className="px-4 py-8 text-center text-sm text-slate-500">No properties in this bucket (demo).</p>
        ) : null}
      </div>
    </>
  );
}
