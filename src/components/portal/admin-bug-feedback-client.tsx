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
  deleteBugFeedbackRow,
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [applyingSchema, setApplyingSchema] = useState(false);

  const refresh = useCallback(async () => {
    const result = await syncBugFeedbackFromServer({ force: true });
    setRows(result.rows);
    setLoadError(result.error ?? null);
    setSchemaMissing(Boolean(result.schemaMissing));
  }, []);

  useEffect(() => {
    queueMicrotask(() => void refresh());
    const onRefresh = () => void refresh();
    window.addEventListener(ADMIN_UI_EVENT, onRefresh);
    return () => window.removeEventListener(ADMIN_UI_EVENT, onRefresh);
  }, [refresh]);

  const { managerRows, residentRows } = useMemo(() => groupBugFeedbackForAdmin(rows, tabId), [rows, tabId]);
  const tabCounts = useMemo(() => countBugFeedbackTabs(rows), [rows]);

  const applySchema = async () => {
    setApplyingSchema(true);
    try {
      const res = await fetch("/api/admin/ensure-portal-schema", { method: "POST", credentials: "include" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        showToast(body.error ?? "Could not set up feedback storage.");
        return;
      }
      showToast("Feedback storage is ready. Ask managers to resubmit any reports sent before setup.");
      await refresh();
    } catch {
      showToast("Could not set up feedback storage.");
    } finally {
      setApplyingSchema(false);
    }
  };

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

  const resolveRow = async (row: PortalBugFeedbackRow) => {
    setSavingId(row.id);
    try {
      await updateBugFeedbackRow(row.id, { status: "resolved" });
      await refresh();
      showToast("Marked resolved.");
    } catch {
      showToast("Could not resolve.");
    } finally {
      setSavingId(null);
    }
  };

  const deleteRow = async (row: PortalBugFeedbackRow) => {
    if (!window.confirm(`Delete this ${row.type === "bug" ? "bug report" : "feedback item"}? This cannot be undone.`)) {
      return;
    }
    setSavingId(row.id);
    try {
      await deleteBugFeedbackRow(row.id, { admin: true });
      await refresh();
      setExpandedId((cur) => (cur === row.id ? null : cur));
      showToast("Deleted.");
    } catch {
      showToast("Could not delete.");
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
      <p className="mb-5 text-sm text-muted">
        {tabId === "bugs"
          ? "Issues reported from manager and resident portals, grouped by role."
          : "Product feedback from portal users, grouped by role."}
      </p>

      {schemaMissing ? (
        <div className="mb-5 rounded-2xl border px-4 py-3 text-sm portal-banner-pending">
          <p className="font-semibold">Feedback storage is not set up in Supabase yet.</p>
          <p className="mt-1 leading-relaxed">
            Manager and resident submissions cannot be saved until the{" "}
            <code className="rounded bg-white/70 px-1 py-0.5 text-xs">portal_bug_feedback_records</code> table exists.
            Run the migration in Supabase SQL Editor, or use the button below if{" "}
            <code className="rounded bg-white/70 px-1 py-0.5 text-xs">DATABASE_URL</code> is configured on the server.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="rounded-full" disabled={applyingSchema} onClick={() => void applySchema()}>
              {applyingSchema ? "Setting up…" : "Set up feedback storage"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => {
                void (async () => {
                  try {
                    const res = await fetch("/api/admin/ensure-portal-schema", { credentials: "include" });
                    const body = (await res.json().catch(() => ({}))) as { migrationSql?: string };
                    const sql = body.migrationSql?.trim();
                    if (!sql) {
                      showToast("Could not load migration SQL.");
                      return;
                    }
                    await navigator.clipboard.writeText(sql);
                    showToast("Migration SQL copied. Paste into Supabase → SQL Editor → Run.");
                  } catch {
                    showToast("Could not copy migration SQL.");
                  }
                })();
              }}
            >
              Copy migration SQL
            </Button>
          </div>
        </div>
      ) : loadError ? (
        <div className="mb-5 rounded-2xl border px-4 py-3 text-sm portal-banner-danger">
          Could not load feedback: {loadError}
        </div>
      ) : null}

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
          onResolve={(row) => void resolveRow(row)}
          onDelete={(row) => void deleteRow(row)}
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
          onResolve={(row) => void resolveRow(row)}
          onDelete={(row) => void deleteRow(row)}
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
  onResolve,
  onDelete,
}: {
  title: string;
  subtitle: string;
  rows: PortalBugFeedbackRow[];
  emptyLabel: string;
  expandedId: string | null;
  savingId: string | null;
  onToggle: (id: string) => void;
  onSave: (row: PortalBugFeedbackRow, status: BugFeedbackStatus, notes: string) => void;
  onResolve: (row: PortalBugFeedbackRow) => void;
  onDelete: (row: PortalBugFeedbackRow) => void;
}) {
  return (
    <details
      className="group overflow-hidden rounded-2xl border border-border bg-card shadow-sm open:shadow-[0_8px_28px_-20px_rgba(15,23,42,0.18)]"
      open
    >
      <summary className="cursor-pointer list-none border-b border-transparent px-5 py-4 group-open:border-border [&::-webkit-details-marker]:hidden">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">{subtitle}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full bg-accent/30 px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-muted">
              {rows.length}
            </span>
            <span className="text-xs font-semibold text-primary group-open:hidden">Open</span>
            <span className="hidden text-xs font-semibold text-muted group-open:inline">Hide</span>
          </div>
        </div>
      </summary>

      <div className="overflow-x-auto">
        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">{emptyLabel}</p>
        ) : (
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className={PORTAL_TABLE_HEAD_ROW}>
                <th className={`${MANAGER_TABLE_TH} w-8`} />
                <th className={`${MANAGER_TABLE_TH} text-left`}>When</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>From</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Title</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
                <th className={`${MANAGER_TABLE_TH} text-right`}>Actions</th>
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
                      <td className={`${PORTAL_TABLE_TD} text-muted`}>{open ? "▾" : "▸"}</td>
                      <td className={`${PORTAL_TABLE_TD} whitespace-nowrap text-xs text-muted`}>
                        {formatWhen(row.createdAt)}
                      </td>
                      <td className={PORTAL_TABLE_TD}>
                        <p className="font-medium text-foreground">{row.reporterName || row.reporterEmail}</p>
                        <p className="text-xs text-muted">
                          {roleGroupLabelForFeedback(row.reporterRole)} · {row.reporterEmail}
                        </p>
                      </td>
                      <td className={PORTAL_TABLE_TD}>
                        <p className="font-medium text-foreground">{row.title}</p>
                        {row.severity ? (
                          <p className="text-xs capitalize text-muted">Severity: {row.severity}</p>
                        ) : null}
                      </td>
                      <td className={PORTAL_TABLE_TD}>
                        <span className="rounded-full bg-accent/30 px-2 py-0.5 text-[11px] font-semibold capitalize text-muted">
                          {row.status}
                        </span>
                      </td>
                      <td className={`${PORTAL_TABLE_TD} text-right`} onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {row.status !== "resolved" && row.status !== "closed" ? (
                            <Button
                              type="button"
                              variant="outline"
                              className="min-h-0 rounded-full px-3 py-1 text-[11px]"
                              disabled={savingId === row.id}
                              onClick={() => onResolve(row)}
                            >
                              Resolve
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="danger"
                            className="min-h-0 rounded-full px-3 py-1 text-[11px]"
                            disabled={savingId === row.id}
                            onClick={() => onDelete(row)}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {open ? (
                      <tr className={PORTAL_TABLE_DETAIL_ROW}>
                        <td colSpan={6} className={PORTAL_TABLE_DETAIL_CELL}>
                          <div className="space-y-3 text-sm text-muted">
                            <p className="whitespace-pre-wrap">{row.description}</p>
                            {row.stepsToReproduce ? (
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                                  Steps to reproduce
                                </p>
                                <p className="mt-1 whitespace-pre-wrap">{row.stepsToReproduce}</p>
                              </div>
                            ) : null}
                            {row.pageUrl ? (
                              <p className="text-xs text-muted">
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
                            {row.attachmentUrls && row.attachmentUrls.length > 0 ? (
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Attachments</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {row.attachmentUrls.map((url) => (
                                    <a
                                      key={url}
                                      href={url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="block overflow-hidden rounded-lg border border-border bg-card"
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={url} alt="Feedback attachment" className="h-24 w-24 object-cover" />
                                    </a>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                            <AdminRowEditor
                              row={row}
                              busy={savingId === row.id}
                              onSave={(status, notes) => onSave(row, status, notes)}
                              onResolve={() => onResolve(row)}
                              onDelete={() => onDelete(row)}
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
  onResolve,
  onDelete,
}: {
  row: PortalBugFeedbackRow;
  busy: boolean;
  onSave: (status: BugFeedbackStatus, notes: string) => void;
  onResolve: () => void;
  onDelete: () => void;
}) {
  const [status, setStatus] = useState<BugFeedbackStatus>(row.status);
  const [notes, setNotes] = useState(row.adminNotes ?? "");

  useEffect(() => {
    queueMicrotask(() => {
      setStatus(row.status);
      setNotes(row.adminNotes ?? "");
    });
  }, [row.adminNotes, row.status]);

  return (
    <div className="mt-4 grid gap-3 rounded-xl border border-border bg-accent/30 p-4 sm:grid-cols-[160px_1fr_auto] sm:items-end">
      <div>
        <p className="mb-1 text-[11px] font-medium text-muted">Status</p>
        <Select value={status} onChange={(e) => setStatus(e.target.value as BugFeedbackStatus)} className="bg-card">
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <p className="mb-1 text-[11px] font-medium text-muted">Admin notes (internal)</p>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="bg-card" placeholder="Triage notes…" />
      </div>
      <Button type="button" variant="outline" className="rounded-full" disabled={busy} onClick={(e) => { e.stopPropagation(); onSave(status, notes); }}>
        {busy ? "Saving…" : "Save"}
      </Button>
      <div className="flex flex-wrap gap-2 sm:col-span-3" onClick={(e) => e.stopPropagation()}>
        {row.status !== "resolved" && row.status !== "closed" ? (
          <Button type="button" variant="outline" className="rounded-full" disabled={busy} onClick={(e) => { e.stopPropagation(); onResolve(); }}>
            Mark resolved
          </Button>
        ) : null}
        <Button
          type="button"
          variant="danger"
          className="rounded-full"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}
