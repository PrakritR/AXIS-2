"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PortalDataTableEmpty,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TR_EXPANDABLE,
  PORTAL_TABLE_TD,
  createPortalRowExpandClick,
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
  type BugFeedbackStatus,
  type PortalBugFeedbackRow,
} from "@/lib/portal-bug-feedback";
import { groupBugFeedbackForAdmin, roleGroupLabelForFeedback } from "@/lib/portal-bug-feedback-utils";

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

type RoleFilter = "managers" | "residents";

function feedbackStatusClass(status: BugFeedbackStatus) {
  switch (status) {
    case "open":
      return "portal-badge-pending ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";
    case "reviewing":
      return "portal-badge-info ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";
    case "resolved":
      return "portal-badge-success ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";
    default:
      return "bg-accent/30 text-muted ring-1 ring-border";
  }
}

export function AdminBugFeedbackClient() {
  const { showToast } = useAppUi();
  const [rows, setRows] = useState<PortalBugFeedbackRow[]>(() => readBugFeedbackRows());
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("managers");
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

  const { managerRows, residentRows } = useMemo(() => groupBugFeedbackForAdmin(rows), [rows]);
  const visibleRows = roleFilter === "managers" ? managerRows : residentRows;

  const roleTabs = useMemo(
    () => [
      { id: "managers" as const, label: "Managers", count: managerRows.length },
      { id: "residents" as const, label: "Residents", count: residentRows.length },
    ],
    [managerRows.length, residentRows.length],
  );

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

  return (
    <ManagerPortalPageShell
      title="Feedback"
      subtitle="Submissions from manager and resident portals."
      filterRow={
        <ManagerPortalStatusPills
          tabs={roleTabs}
          activeId={roleFilter}
          onChange={(id) => {
            setRoleFilter(id as RoleFilter);
            setExpandedId(null);
          }}
        />
      }
    >
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

      {visibleRows.length === 0 ? (
        <PortalDataTableEmpty
          message={
            roleFilter === "managers"
              ? "No manager feedback yet."
              : "No resident feedback yet."
          }
        />
      ) : (
        <div className={PORTAL_DATA_TABLE_WRAP}>
          <div className={PORTAL_DATA_TABLE_SCROLL}>
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className={PORTAL_TABLE_HEAD_ROW}>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>When</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>From</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Title</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const open = expandedId === row.id;
                  return (
                    <Fragment key={row.id}>
                      <tr
                        className={PORTAL_TABLE_TR_EXPANDABLE}
                        onClick={createPortalRowExpandClick(() =>
                          setExpandedId((cur) => (cur === row.id ? null : row.id)),
                        )}
                        aria-expanded={open}
                      >
                        <td className={`${PORTAL_TABLE_TD} whitespace-nowrap text-xs text-muted`}>
                          {formatWhen(row.createdAt)}
                        </td>
                        <td className={PORTAL_TABLE_TD}>
                          <p className="font-medium text-foreground">{row.reporterName || row.reporterEmail}</p>
                          <p className="text-xs text-muted">
                            {roleGroupLabelForFeedback(row.reporterRole)} · {row.reporterEmail}
                          </p>
                        </td>
                        <td className={`${PORTAL_TABLE_TD} font-medium text-foreground`}>{row.title}</td>
                        <td className={PORTAL_TABLE_TD}>
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${feedbackStatusClass(row.status)}`}
                          >
                            {row.status}
                          </span>
                        </td>
                      </tr>
                      {open ? (
                        <tr className={PORTAL_TABLE_DETAIL_ROW}>
                          <td colSpan={4} className={PORTAL_TABLE_DETAIL_CELL}>
                            <div className="space-y-4 text-sm text-muted">
                              <p className="whitespace-pre-wrap leading-relaxed text-foreground">{row.description}</p>
                              {row.stepsToReproduce ? (
                                <div>
                                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                                    Steps to reproduce
                                  </p>
                                  <p className="mt-1 whitespace-pre-wrap">{row.stepsToReproduce}</p>
                                </div>
                              ) : null}
                              {row.attachmentUrls && row.attachmentUrls.length > 0 ? (
                                <div>
                                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Attachments</p>
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {row.attachmentUrls.slice(0, 4).map((url) => (
                                      <a
                                        key={url}
                                        href={url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="block overflow-hidden rounded-lg border border-border bg-card transition hover:opacity-90"
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
                                onSave={(status, notes) => void saveStatus(row, status, notes)}
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
          </div>
        </div>
      )}
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
    queueMicrotask(() => {
      setStatus(row.status);
      setNotes(row.adminNotes ?? "");
    });
  }, [row.adminNotes, row.status]);

  return (
    <div className="rounded-xl border border-border bg-accent/20 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-36">
          <p className="mb-1.5 text-[11px] font-medium text-muted">Status</p>
          <Select value={status} onChange={(e) => setStatus(e.target.value as BugFeedbackStatus)} className="bg-card">
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-0 flex-1">
          <p className="mb-1.5 text-[11px] font-medium text-muted">Admin notes (internal)</p>
          <Textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="bg-card"
            placeholder="Triage notes…"
          />
        </div>
        <Button
          type="button"
          className="shrink-0 rounded-full sm:mb-0.5"
          disabled={busy}
          onClick={() => onSave(status, notes)}
        >
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
