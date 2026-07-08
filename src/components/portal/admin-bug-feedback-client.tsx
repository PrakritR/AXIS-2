"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { PORTAL_DATA_TABLE, PortalDataTableColGroup, portalTableColumnPercents, PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PORTAL_DETAIL_BTN,
  PORTAL_MOBILE_CARD_CLASS,
  PORTAL_MOBILE_DETAIL_EXPAND,
  PortalDataTableEmpty,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TR_EXPANDABLE,
  PORTAL_TABLE_TD,
  PortalTableInlineExpand,
  createPortalRowExpandClick,} from "@/components/portal/portal-data-table";
import { MANAGER_TABLE_TH, ManagerPortalPageShell, ManagerPortalStatusPills } from "@/components/portal/portal-metrics";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/input";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { ADMIN_UI_EVENT } from "@/lib/demo-admin-ui";
import {
  deleteBugFeedbackRow,
  readBugFeedbackRows,
  syncBugFeedbackFromServer,
  updateBugFeedbackRow,
  type BugFeedbackReporterRole,
  type BugFeedbackStatus,
  type PortalBugFeedbackRow,
} from "@/lib/portal-bug-feedback";
import { roleGroupLabelForFeedback, feedbackStatusLabel } from "@/lib/portal-bug-feedback-utils";

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
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
];

type StatusFilter = "all" | BugFeedbackStatus;
type SortFilter = "newest" | "oldest" | "status";
type PortalFilter = "all" | "managers" | "residents" | "vendors" | "admin";

/** Map a reporter role to the portal it came from (for the source filter). */
function portalForRole(role: BugFeedbackReporterRole): Exclude<PortalFilter, "all"> {
  if (role === "resident") return "residents";
  if (role === "vendor") return "vendors";
  if (role === "admin") return "admin";
  return "managers";
}

function feedbackStatusClass(status: BugFeedbackStatus) {
  switch (status) {
    case "open":
      return "portal-badge-pending ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";
    case "in_progress":
      return "portal-badge-info ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";
    case "completed":
      return "portal-badge-success ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";
    default:
      return "bg-accent/30 text-muted ring-1 ring-border";
  }
}

function sortFeedbackRows(rows: PortalBugFeedbackRow[], sort: SortFilter): PortalBugFeedbackRow[] {
  const next = [...rows];
  if (sort === "oldest") {
    return next.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  if (sort === "status") {
    const rank: Record<BugFeedbackStatus, number> = { open: 0, in_progress: 1, completed: 2 };
    return next.sort((a, b) => {
      const byStatus = rank[a.status] - rank[b.status];
      if (byStatus !== 0) return byStatus;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }
  return next.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function AdminBugFeedbackClient({ embedded = false }: { embedded?: boolean }) {
  const { showToast } = useAppUi();
  const [rows, setRows] = useState<PortalBugFeedbackRow[]>(() => readBugFeedbackRows());
  const [portalFilter, setPortalFilter] = useState<PortalFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortFilter, setSortFilter] = useState<SortFilter>("newest");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
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

  const portalRows = useMemo(
    () => (portalFilter === "all" ? rows : rows.filter((r) => portalForRole(r.reporterRole) === portalFilter)),
    [rows, portalFilter],
  );

  const visibleRows = useMemo(() => {
    const filtered = statusFilter === "all" ? portalRows : portalRows.filter((r) => r.status === statusFilter);
    return sortFeedbackRows(filtered, sortFilter);
  }, [portalRows, statusFilter, sortFilter]);

  const portalTabs = useMemo(
    () => [
      { id: "all" as const, label: "All", count: rows.length, dataAttr: "admin-feedback-portal-all" },
      {
        id: "managers" as const,
        label: "Managers",
        count: rows.filter((r) => portalForRole(r.reporterRole) === "managers").length,
        dataAttr: "admin-feedback-portal-managers",
      },
      {
        id: "residents" as const,
        label: "Residents",
        count: rows.filter((r) => portalForRole(r.reporterRole) === "residents").length,
        dataAttr: "admin-feedback-portal-residents",
      },
      {
        id: "vendors" as const,
        label: "Vendors",
        count: rows.filter((r) => portalForRole(r.reporterRole) === "vendors").length,
        dataAttr: "admin-feedback-portal-vendors",
      },
      {
        id: "admin" as const,
        label: "Admin",
        count: rows.filter((r) => portalForRole(r.reporterRole) === "admin").length,
        dataAttr: "admin-feedback-portal-admin",
      },
    ],
    [rows],
  );

  const statusTabs = useMemo(
    () => [
      { id: "all" as const, label: "All", count: portalRows.length, dataAttr: "admin-feedback-status-all" },
      {
        id: "open" as const,
        label: "Open",
        count: portalRows.filter((r) => r.status === "open").length,
        dataAttr: "admin-feedback-status-open",
      },
      {
        id: "in_progress" as const,
        label: "In progress",
        count: portalRows.filter((r) => r.status === "in_progress").length,
        dataAttr: "admin-feedback-status-in-progress",
      },
      {
        id: "completed" as const,
        label: "Completed",
        count: portalRows.filter((r) => r.status === "completed").length,
        dataAttr: "admin-feedback-status-completed",
      },
    ],
    [portalRows],
  );

  const hasAnyFeedback = rows.length > 0;

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

  const handleDelete = async (row: PortalBugFeedbackRow) => {
    if (!window.confirm("Delete this feedback item? This cannot be undone.")) return;
    setDeletingId(row.id);
    try {
      await deleteBugFeedbackRow(row.id, { admin: true });
      if (expandedId === row.id) setExpandedId(null);
      await refresh();
      showToast("Deleted.");
    } catch {
      showToast("Could not delete.");
    } finally {
      setDeletingId(null);
    }
  };

  const renderRowDetail = (row: PortalBugFeedbackRow) => (
    <div className="space-y-4 text-sm text-muted">
      <p className="whitespace-pre-wrap leading-relaxed text-foreground">{row.description}</p>
      {row.stepsToReproduce ? (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Steps to reproduce</p>
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
        saving={savingId === row.id}
        deleting={deletingId === row.id}
        onSave={(status, notes) => void saveStatus(row, status, notes)}
        onDelete={() => void handleDelete(row)}
      />
    </div>
  );

  const filterRow = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ManagerPortalStatusPills
          tabs={portalTabs}
          activeId={portalFilter}
          activeTone="primary"
          onChange={(id) => {
            setPortalFilter(id as PortalFilter);
            setExpandedId(null);
          }}
        />
        <label className="flex items-center gap-2 text-sm text-muted">
          <span className="shrink-0 font-medium">Sort</span>
          <Select
            value={sortFilter}
            onChange={(e) => setSortFilter(e.target.value as SortFilter)}
            className="h-9 min-w-[10rem] rounded-full bg-card text-sm"
            aria-label="Sort feedback"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="status">Status</option>
          </Select>
        </label>
      </div>
      <ManagerPortalStatusPills
        tabs={statusTabs}
        activeId={statusFilter}
        compact
        onChange={(id) => {
          setStatusFilter(id as StatusFilter);
          setExpandedId(null);
        }}
      />
    </div>
  );

  const renderTable = (tableRows: PortalBugFeedbackRow[]) => (
    <>
      <div className="space-y-2 lg:hidden">
        {tableRows.map((row) => {
          const open = expandedId === row.id;
          return (
            <div key={row.id} className={PORTAL_MOBILE_CARD_CLASS}>
              <button
                type="button"
                className="w-full text-left"
                onClick={() => setExpandedId((cur) => (cur === row.id ? null : row.id))}
              >
                <div className="flex items-start justify-between gap-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{row.title}</p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      From {row.reporterName || row.reporterEmail} · {formatWhen(row.createdAt)}
                    </p>
                  </div>
                  <span
                    className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${feedbackStatusClass(row.status)}`}
                  >
                    {feedbackStatusLabel(row.status)}
                  </span>
                </div>
              </button>
              <div className="mt-2">
                <Button
                  type="button"
                  variant="outline"
                  className={PORTAL_DETAIL_BTN}
                  onClick={() => setExpandedId((cur) => (cur === row.id ? null : row.id))}
                >
                  {open ? "Less" : "Details"}
                </Button>
              </div>
              {open ? <div className={PORTAL_MOBILE_DETAIL_EXPAND}>{renderRowDetail(row)}</div> : null}
            </div>
          );
        })}
      </div>
      <div className={`${PORTAL_DATA_TABLE_WRAP} hidden lg:block`}>
        <div className={PORTAL_DATA_TABLE_SCROLL}>
          <table className={PORTAL_DATA_TABLE}>
            <PortalDataTableColGroup percents={portalTableColumnPercents(4, [16, 30, 36, 18])} />
            <thead>
              <tr className={PORTAL_TABLE_HEAD_ROW}>
                <th className={`${MANAGER_TABLE_TH} text-left`}>When</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>From</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Title</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row) => {
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
                      <td className={`${PORTAL_TABLE_TD} font-medium text-foreground`}>
                        <PortalTableInlineExpand expanded={open}>{row.title}</PortalTableInlineExpand>
                      </td>
                      <td className={PORTAL_TABLE_TD}>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${feedbackStatusClass(row.status)}`}
                        >
                          {feedbackStatusLabel(row.status)}
                        </span>
                      </td>
                    </tr>
                    {open ? (
                      <tr className={PORTAL_TABLE_DETAIL_ROW}>
                        <td colSpan={4} className={PORTAL_TABLE_DETAIL_CELL}>
                          {renderRowDetail(row)}
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
    </>
  );

  const content = (
    <>
      {schemaMissing ? (
        <div className="mb-5 rounded-2xl border px-4 py-3 text-sm portal-banner-pending">
          <p className="font-semibold">Feedback storage is not set up in Supabase yet.</p>
          <p className="mt-1 leading-relaxed">
            Manager and resident submissions cannot be saved until the{" "}
            <code className="rounded bg-black/[0.06] px-1 py-0.5 text-xs [html[data-theme=dark]_&]:bg-white/15">portal_bug_feedback_records</code> table exists.
            Run the migration in Supabase SQL Editor, or use the button below if{" "}
            <code className="rounded bg-black/[0.06] px-1 py-0.5 text-xs [html[data-theme=dark]_&]:bg-white/15">DATABASE_URL</code> is configured on the server.
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

      {!hasAnyFeedback ? (
        <PortalDataTableEmpty icon="feedback" message="No feedback yet." />
      ) : visibleRows.length === 0 ? (
        <PortalDataTableEmpty icon="feedback" message="No feedback matching these filters." />
      ) : (
        renderTable(visibleRows)
      )}
    </>
  );

  if (embedded) {
    return (
      <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)] sm:p-6">
        <p className="text-sm font-semibold text-foreground">Feedback</p>
        {filterRow}
        {content}
      </div>
    );
  }

  return (
    <ManagerPortalPageShell title="Feedback" filterRow={filterRow}>
      {content}
    </ManagerPortalPageShell>
  );
}

function AdminRowEditor({
  row,
  saving,
  deleting,
  onSave,
  onDelete,
}: {
  row: PortalBugFeedbackRow;
  saving: boolean;
  deleting: boolean;
  onSave: (status: BugFeedbackStatus, notes: string) => void;
  onDelete: () => void;
}) {
  const [status, setStatus] = useState<BugFeedbackStatus>(row.status);
  const [notes, setNotes] = useState(row.adminNotes ?? "");
  const busy = saving || deleting;

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
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:mb-0.5">
          <Button
            type="button"
            variant="outline"
            className="rounded-full border-rose-200 text-rose-800 hover:bg-[var(--status-overdue-bg)]"
            disabled={busy}
            onClick={onDelete}
          >
            {deleting ? "Deleting…" : "Delete"}
          </Button>
          <Button type="button" className="rounded-full" disabled={busy} onClick={() => onSave(status, notes)}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
