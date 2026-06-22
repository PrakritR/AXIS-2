"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_ROW_TOGGLE_CLASS,
  PORTAL_TABLE_TD,
  PORTAL_TABLE_TR,
} from "@/components/portal/portal-data-table";
import { MANAGER_TABLE_TH, ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/input";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { ADMIN_UI_EVENT } from "@/lib/demo-admin-ui";
import {
  readBugFeedbackRows,
  syncBugFeedbackFromServer,
  updateBugFeedbackRow,
  type BugFeedbackStatus,
  type PortalBugFeedbackRow,
} from "@/lib/portal-bug-feedback";

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

const STATUS_OPTIONS: { value: BugFeedbackStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "reviewing", label: "Reviewing" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

export function AdminBugFeedbackClient({ tabId }: { tabId: "bugs" | "feedback" }) {
  const { showToast } = useAppUi();
  const [rows, setRows] = useState<PortalBugFeedbackRow[]>(() => readBugFeedbackRows());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const next = await syncBugFeedbackFromServer({ force: true });
    setRows(next);
  }, []);

  useEffect(() => {
    void refresh();
    const onRefresh = () => void refresh();
    window.addEventListener(ADMIN_UI_EVENT, onRefresh);
    return () => window.removeEventListener(ADMIN_UI_EVENT, onRefresh);
  }, [refresh]);

  const filtered = useMemo(
    () =>
      [...rows]
        .filter((r) => (tabId === "bugs" ? r.type === "bug" : r.type === "feedback"))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [rows, tabId],
  );

  const saveStatus = async (row: PortalBugFeedbackRow, status: BugFeedbackStatus, adminNotes: string) => {
    setSavingId(row.id);
    try {
      await updateBugFeedbackRow(row.id, { status, adminNotes: adminNotes.trim() || undefined });
      await refresh();
      showToast("Updated.");
    } catch {
      showToast("Could not save.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <ManagerPortalPageShell title={tabId === "bugs" ? "Bug reports" : "Feedback"}>
      <p className="mb-6 text-sm text-slate-500">
        {tabId === "bugs"
          ? "Issues reported by managers and residents from their portals."
          : "Product feedback and feature requests from portal users."}
      </p>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead>
            <tr className={PORTAL_TABLE_HEAD_ROW}>
              <th className={`${MANAGER_TABLE_TH} w-8`} />
              <th className={`${MANAGER_TABLE_TH} text-left`}>When</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>From</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Title</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-500">
                  No {tabId === "bugs" ? "bug reports" : "feedback"} yet.
                </td>
              </tr>
            ) : (
              filtered.map((row) => {
                const open = expandedId === row.id;
                return (
                  <Fragment key={row.id}>
                    <tr
                      className={`${PORTAL_TABLE_TR} ${PORTAL_TABLE_ROW_TOGGLE_CLASS} cursor-pointer`}
                      onClick={() => setExpandedId(open ? null : row.id)}
                    >
                      <td className={`${PORTAL_TABLE_TD} text-slate-400`}>{open ? "▾" : "▸"}</td>
                      <td className={`${PORTAL_TABLE_TD} whitespace-nowrap text-xs text-slate-500`}>
                        {formatWhen(row.createdAt)}
                      </td>
                      <td className={PORTAL_TABLE_TD}>
                        <p className="font-medium text-slate-900">{row.reporterName || row.reporterEmail}</p>
                        <p className="text-xs text-slate-500">
                          {row.reporterRole} · {row.reporterEmail}
                        </p>
                      </td>
                      <td className={PORTAL_TABLE_TD}>
                        <p className="font-medium text-slate-900">{row.title}</p>
                        {row.severity ? (
                          <p className="text-xs capitalize text-slate-500">Severity: {row.severity}</p>
                        ) : null}
                      </td>
                      <td className={PORTAL_TABLE_TD}>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold capitalize text-slate-700">
                          {row.status}
                        </span>
                      </td>
                    </tr>
                    {open ? (
                      <tr className={PORTAL_TABLE_DETAIL_ROW}>
                        <td colSpan={5} className={PORTAL_TABLE_DETAIL_CELL}>
                          <div className="space-y-3 text-sm text-slate-700">
                            <p className="whitespace-pre-wrap">{row.description}</p>
                            {row.stepsToReproduce ? (
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Steps to reproduce</p>
                                <p className="mt-1 whitespace-pre-wrap">{row.stepsToReproduce}</p>
                              </div>
                            ) : null}
                            {row.pageUrl ? (
                              <p className="text-xs text-slate-500">
                                Page:{" "}
                                <a href={row.pageUrl} className="text-primary hover:underline" target="_blank" rel="noreferrer">
                                  {row.pageUrl}
                                </a>
                              </p>
                            ) : null}
                            <AdminRowEditor
                              row={row}
                              busy={savingId === row.id}
                              onSave={(status, notes) => void saveStatus(row, status, notes)}
                            />
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </ManagerPortalPageShell>
  );
}

function AdminRowEditor({
  row,
  busy,
  onSave,
}: {
  row: PortalBugFeedbackRow;
  busy: boolean;
  onSave: (status: BugFeedbackStatus, notes: string) => void;
}) {
  const [status, setStatus] = useState<BugFeedbackStatus>(row.status);
  const [notes, setNotes] = useState(row.adminNotes ?? "");

  useEffect(() => {
    setStatus(row.status);
    setNotes(row.adminNotes ?? "");
  }, [row.adminNotes, row.status]);

  return (
    <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4 sm:grid-cols-[160px_1fr_auto] sm:items-end">
      <div>
        <p className="mb-1 text-[11px] font-medium text-slate-600">Status</p>
        <Select value={status} onChange={(e) => setStatus(e.target.value as BugFeedbackStatus)} className="bg-white">
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <p className="mb-1 text-[11px] font-medium text-slate-600">Admin notes (internal)</p>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="bg-white" placeholder="Triage notes…" />
      </div>
      <Button type="button" variant="outline" className="rounded-full" disabled={busy} onClick={() => onSave(status, notes)}>
        {busy ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
