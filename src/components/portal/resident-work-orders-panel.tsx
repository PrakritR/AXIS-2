"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/input";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  MANAGER_TABLE_TH,
  ManagerPortalPageShell,
  ManagerPortalStatusPills,
} from "@/components/portal/portal-metrics";
import {
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PortalDataTableEmpty,
  PORTAL_DETAIL_BTN,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_ROW_TOGGLE_CLASS,
  PORTAL_TABLE_TR,
  PORTAL_TABLE_TD,
  PortalTableDetailActions,
} from "@/components/portal/portal-data-table";
import type { DemoResidentWorkOrderRow, ResidentWorkBucket } from "@/data/demo-portal";

const TABS: { id: ResidentWorkBucket; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "scheduled", label: "Scheduled" },
  { id: "completed", label: "Completed" },
];

const RESIDENT_WORK_ORDERS_KEY = "axis_resident_work_orders_v1";

function readStoredRows(): DemoResidentWorkOrderRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RESIDENT_WORK_ORDERS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStoredRows(rows: DemoResidentWorkOrderRow[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RESIDENT_WORK_ORDERS_KEY, JSON.stringify(rows));
  } catch {
    /* ignore */
  }
}

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
  const [createdRows, setCreatedRows] = useState<DemoResidentWorkOrderRow[]>([]);

  useEffect(() => {
    setCreatedRows(readStoredRows());
  }, []);

  const allRows = useMemo(() => createdRows, [createdRows]);

  const rows = useMemo(() => allRows.filter((r) => r.bucket === bucket), [allRows, bucket]);

  const counts = useMemo(() => {
    const c: Record<ResidentWorkBucket, number> = { open: 0, scheduled: 0, completed: 0 };
    for (const r of allRows) c[r.bucket] += 1;
    return c;
  }, [allRows]);

  const statusTabs = useMemo(
    () => TABS.map(({ id, label }) => ({ id, label, count: counts[id] })),
    [counts],
  );

  const submitNew = () => {
    if (!title.trim()) {
      showToast("Add a short title first.");
      return;
    }
    const row: DemoResidentWorkOrderRow = {
      id: `RWO-${Date.now()}`,
      title: title.trim(),
      category,
      priority,
      status: "Submitted",
      bucket: "open",
      description:
        "Your request is logged. Maintenance will review and update this thread — open Details anytime for notes.",
    };
    setCreatedRows((prev) => {
      const next = [row, ...prev];
      writeStoredRows(next);
      return next;
    });
    setExpandedId(row.id);
    showToast("Work order added to your open requests.");
    setTitle("");
  };

  return (
    <ManagerPortalPageShell
      title="Work orders"
      titleAside={
        <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={() => showToast("Work orders refreshed.")}>
          Refresh
        </Button>
      }
      filterRow={
        <ManagerPortalStatusPills tabs={statusTabs} activeId={bucket} onChange={(id) => setBucket(id as ResidentWorkBucket)} />
      }
    >
      <div className={PORTAL_DATA_TABLE_WRAP}>
        {rows.length === 0 ? (
          <PortalDataTableEmpty
            message={allRows.length === 0 ? "No work orders yet. Create one below." : "No work orders in this status."}
          />
        ) : (
          <div className={PORTAL_DATA_TABLE_SCROLL}>
            <table className="min-w-[640px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className={PORTAL_TABLE_HEAD_ROW}>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>ID</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Title</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Category</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Priority</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
                  <th className={`${MANAGER_TABLE_TH} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row: DemoResidentWorkOrderRow) => (
                  <Fragment key={row.id}>
                    <tr className={PORTAL_TABLE_TR}>
                      <td className={`${PORTAL_TABLE_TD} font-mono text-xs text-slate-600`}>{row.id}</td>
                      <td className={`${PORTAL_TABLE_TD} font-medium text-slate-900`}>{row.title}</td>
                      <td className={PORTAL_TABLE_TD}>{row.category}</td>
                      <td className={PORTAL_TABLE_TD}>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${priorityClass(row.priority)}`}>
                          {row.priority}
                        </span>
                      </td>
                      <td className={PORTAL_TABLE_TD}>{row.status}</td>
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
                        <td colSpan={6} className={`${PORTAL_TABLE_DETAIL_CELL} text-sm text-slate-600`}>
                          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Description</p>
                          <p className="mt-1.5 leading-relaxed">{row.description}</p>
                          {bucket === "open" ? (
                            <PortalTableDetailActions>
                              <Button
                                type="button"
                                variant="outline"
                                className={PORTAL_DETAIL_BTN}
                                onClick={() => {
                                  setCreatedRows((prev) => {
                                    const next = prev.filter((r) => r.id !== row.id);
                                    writeStoredRows(next);
                                    return next;
                                  });
                                  setExpandedId(null);
                                  showToast("Work order removed.");
                                }}
                              >
                                Delete request
                              </Button>
                            </PortalTableDetailActions>
                          ) : null}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-6 rounded-xl border border-slate-200/60 bg-slate-50/30 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Create work order</p>
        <p className="mt-1 text-xs text-slate-500">New requests appear above; open Details for notes below the row.</p>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
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
        <p className="mt-2 text-xs text-slate-500">Photos attach in production; here the button confirms intent.</p>
        <Button type="button" variant="outline" className="mt-3 rounded-full text-xs" onClick={() => showToast("Photos attach when media upload is enabled.")}>
          Add photos
        </Button>
      </div>
    </ManagerPortalPageShell>
  );
}
