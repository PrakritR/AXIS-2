"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_ROW_TOGGLE_CLASS,
  PORTAL_TABLE_TD,
  PORTAL_TABLE_TR,
} from "@/components/portal/portal-data-table";
import { MANAGER_TABLE_TH, ManagerPortalPageShell, ManagerPortalStatusPills } from "@/components/portal/portal-metrics";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/input";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { ADMIN_UI_EVENT } from "@/lib/demo-admin-ui";
import {
  readBugFeedbackRows,
  syncBugFeedbackFromServer,
  updateBugFeedbackRow,
  type BugFeedbackReporterRole,
  type BugFeedbackStatus,
  type PortalBugFeedbackRow,
} from "@/lib/portal-bug-feedback";

import {
  countBugFeedbackTabs,
  groupBugFeedbackForAdmin,
  roleGroupLabelForFeedback,
} from "@/lib/portal-bug-feedback-utils";

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
  const router = useRouter();
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

  const { managerRows, residentRows } = useMemo(() => groupBugFeedbackForAdmin(rows, tabId), [rows, tabId]);

  const tabCounts = useMemo(() => countBugFeedbackTabs(rows), [rows]);

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
    <ManagerPortalPageShell
      title="Feedback"
      filterRow={
        <ManagerPortalStatusPills
          activeTone="primary"
          tabs={[
            { id: "bugs", label: "Bugs", count: tabCounts.bugs },
            { id: "feedback", label: "Feedback", count: tabCounts.feedback },
          ]}
          activeId={tabId}
          onChange={(id) => router.push(`/admin/bugs-feedback/${id}`)}
        />
      }
    >
      <p className="mb-5 text-sm text-slate-500">
        {tabId === "bugs"
          ? "Issues reported from manager and resident portals, grouped by role."
          : "Product feedback from portal users, grouped by role."}
      </p>

      <div className="space-y-4">
        <FeedbackRoleGroup
          title="Managers"
          subtitle="Reports from property managers and co-managers."
          rows={managerRows}
          emptyLabel={tabId === "bugs" ? "No manager bug reports yet." : "No manager feedback yet."}
          expandedId={expandedId}
          savingId={savingId}
          onToggle={(id) => setExpandedId(expandedId === id ? null : id)}
          onSave={(row, status, notes) => void saveStatus(row, status, notes)}
        />
        <FeedbackRoleGroup
          title="Residents"
          subtitle="Reports from resident portal accounts."
          rows={residentRows}
          emptyLabel={tabId === "bugs" ? "No resident bug reports yet." : "No resident feedback yet."}
          expandedId={expandedId}
          savingId={savingId}
          onToggle={(id) => setExpandedId(expandedId === id ? null : id)}
          onSave={(row, status, notes) => void saveStatus(row, status, notes)}
        />
      </div>
    </ManagerPortalPageShell>
  );
}

function FeedbackRoleGroup({
  title,
  subtitle,
  rows,
  emptyLabel,
  expandedId,
  savingId,
  onToggle,
  onSave,
}: {
  title: string;
  subtitle: string;
  rows: PortalBugFeedbackRow[];
  emptyLabel: string;
  expandedId: string | null;
  savingId: string | null;
  onToggle: (id: string) => void;
  onSave: (row: PortalBugFeedbackRow, status: BugFeedbackStatus, notes: string) => void;
}) {
  return (
    <details
      className="group overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm open:shadow-[0_8px_28px_-20px_rgba(15,23,42,0.18)]"
      open
    >
      <summary className="cursor-pointer list-none border-b border-transparent px-5 py-4 group-open:border-slate-100 [&::-webkit-details-marker]:hidden">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">{title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{subtitle}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-slate-600">
              {rows.length}
            </span>
            <span className="text-xs font-semibold text-primary group-open:hidden">Open</span>
            <span className="hidden text-xs font-semibold text-slate-400 group-open:inline">Hide</span>
          </div>
        </div>
      </summary>

      <div className="overflow-x-auto">
        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">{emptyLabel}</p>
        ) : (
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
              {rows.map((row) => {
                const open = expandedId === row.id;
                return (
                  <Fragment key={row.id}>
                    <tr
                      className={`${PORTAL_TABLE_TR} ${PORTAL_TABLE_ROW_TOGGLE_CLASS} cursor-pointer`}
                      onClick={() => onToggle(row.id)}
                    >
                      <td className={`${PORTAL_TABLE_TD} text-slate-400`}>{open ? "▾" : "▸"}</td>
                      <td className={`${PORTAL_TABLE_TD} whitespace-nowrap text-xs text-slate-500`}>
                        {formatWhen(row.createdAt)}
                      </td>
                      <td className={PORTAL_TABLE_TD}>
                        <p className="font-medium text-slate-900">{row.reporterName || row.reporterEmail}</p>
                        <p className="text-xs text-slate-500">
                          {roleGroupLabelForFeedback(row.reporterRole)} · {row.reporterEmail}
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
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  Steps to reproduce
                                </p>
                                <p className="mt-1 whitespace-pre-wrap">{row.stepsToReproduce}</p>
                              </div>
                            ) : null}
                            {row.pageUrl ? (
                              <p className="text-xs text-slate-500">
                                Page:{" "}
                                <a
                                  href={row.pageUrl}
                                  className="text-primary hover:underline"
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {row.pageUrl}
                                </a>
                              </p>
                            ) : null}
                            <AdminRowEditor
                              row={row}
                              busy={savingId === row.id}
                              onSave={(status, notes) => onSave(row, status, notes)}
                            />
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </details>
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
