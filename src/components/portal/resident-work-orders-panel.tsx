"use client";

import { Fragment, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/input";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { PortalPanelTabs } from "@/components/portal/panel-tab-strip";
import type { DemoResidentWorkOrderRow, ResidentWorkBucket } from "@/data/demo-portal";
import { demoResidentWorkOrderRows } from "@/data/demo-portal";
import { ManagerSectionShell } from "./manager-section-shell";

const TABS: { id: ResidentWorkBucket; label: string }[] = [
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

export function ResidentWorkOrdersPanel() {
  const { showToast } = useAppUi();
  const [bucket, setBucket] = useState<ResidentWorkBucket>("open");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Plumbing");
  const [priority, setPriority] = useState("Medium");

  const rows = useMemo(() => demoResidentWorkOrderRows.filter((r) => r.bucket === bucket), [bucket]);

  const submitNew = () => {
    if (!title.trim()) {
      showToast("Add a short title first.");
      return;
    }
    showToast(`Work order created: ${title.trim()} · ${category} · ${priority} (demo).`);
    setTitle("");
  };

  return (
    <ManagerSectionShell title="Work orders" actions={[{ label: "Refresh", variant: "outline" }]}>
      <PortalPanelTabs ariaLabel="Work order status" tabs={TABS} active={bucket} onChange={(id) => setBucket(id as ResidentWorkBucket)} />

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[640px] w-full border-collapse text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/90 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3">ID</th>
                <th className="px-3 py-3">Title</th>
                <th className="px-3 py-3">Category</th>
                <th className="px-3 py-3">Priority</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row: DemoResidentWorkOrderRow) => (
                <Fragment key={row.id}>
                  <tr className="border-t border-slate-100 align-top">
                    <td className="px-3 py-3 font-mono text-xs text-slate-600">{row.id}</td>
                    <td className="px-3 py-3 font-medium text-slate-900">{row.title}</td>
                    <td className="px-3 py-3 text-slate-700">{row.category}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${priorityClass(row.priority)}`}>
                        {row.priority}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{row.status}</td>
                    <td className="px-3 py-3 text-right">
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full text-xs"
                        onClick={() => setExpandedId((cur) => (cur === row.id ? null : row.id))}
                      >
                        {expandedId === row.id ? "Hide" : "Expand"}
                      </Button>
                    </td>
                  </tr>
                  {expandedId === row.id ? (
                    <tr className="border-t border-slate-100 bg-slate-50/50">
                      <td colSpan={6} className="px-4 py-4 text-sm text-slate-700">
                        <p className="font-medium text-slate-900">Description</p>
                        <p className="mt-1">{row.description}</p>
                        {bucket === "open" ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="mt-3 rounded-full text-xs"
                            onClick={() => showToast("Work order removed (demo).")}
                          >
                            Delete request
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200/80 bg-slate-50/40 p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Create work order</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="bg-white" />
          <Select value={category} onChange={(e) => setCategory(e.target.value)} className="bg-white">
            <option>Plumbing</option>
            <option>Electrical</option>
            <option>HVAC</option>
            <option>General</option>
            <option>Access</option>
          </Select>
          <Select value={priority} onChange={(e) => setPriority(e.target.value)} className="bg-white">
            <option>Low</option>
            <option>Medium</option>
            <option>High</option>
          </Select>
          <Button type="button" className="rounded-full" onClick={submitNew}>
            Submit
          </Button>
        </div>
        <p className="mt-2 text-xs text-slate-500">Photos attach in production; here the button only confirms intent.</p>
        <Button type="button" variant="outline" className="mt-3 rounded-full text-xs" onClick={() => showToast("Photo picker (demo).")}>
          Add photos
        </Button>
      </div>
    </ManagerSectionShell>
  );
}
