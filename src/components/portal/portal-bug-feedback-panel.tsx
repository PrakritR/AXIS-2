"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { ManagerPortalPageShell, MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";
import { PortalSectionPrimaryButton } from "@/components/portal/portal-list-section";
import { PortalFeedbackSubmitModal } from "@/components/portal/portal-feedback-submit-modal";
import {
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PORTAL_MOBILE_CARD_CLASS,
  PortalDataTableEmpty,
  PORTAL_DETAIL_BTN,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TR_EXPANDABLE,
  PORTAL_TABLE_TD,
  PortalTableDetailActions,
  createPortalRowExpandClick,
} from "@/components/portal/portal-data-table";
import { ADMIN_UI_EVENT } from "@/lib/demo-admin-ui";
import {
  readBugFeedbackRows,
  syncBugFeedbackFromServer,
  deleteBugFeedbackRow,
  type BugFeedbackReporterRole,
  type BugFeedbackStatus,
  type PortalBugFeedbackRow,
} from "@/lib/portal-bug-feedback";
import { usePortalSession } from "@/hooks/use-portal-session";

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

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

export function PortalBugFeedbackPanel({
  reporterRole,
  embedded = false,
}: {
  reporterRole: BugFeedbackReporterRole;
  /** Render as a plain card section (used inside the Settings page) instead of a full page shell. */
  embedded?: boolean;
}) {
  const { showToast } = useAppUi();
  const session = usePortalSession();
  const [rows, setRows] = useState<PortalBugFeedbackRow[]>(() => readBugFeedbackRows());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);

  const refresh = useCallback(async () => {
    const result = await syncBugFeedbackFromServer({ force: true });
    setRows(result.rows);
  }, []);

  useEffect(() => {
    queueMicrotask(() => void refresh());
    const onRefresh = () => void refresh();
    window.addEventListener(ADMIN_UI_EVENT, onRefresh);
    return () => window.removeEventListener(ADMIN_UI_EVENT, onRefresh);
  }, [refresh]);

  const myRows = useMemo(() => {
    const uid = session.userId ?? "";
    const email = (session.email ?? "").trim().toLowerCase();
    return rows
      .filter((r) => (uid && r.reporterUserId === uid) || (email && r.reporterEmail === email))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [rows, session.email, session.userId]);

  const handleDelete = async (row: PortalBugFeedbackRow) => {
    if (!window.confirm("Delete this feedback item?")) return;
    setDeletingId(row.id);
    try {
      await deleteBugFeedbackRow(row.id);
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
    <>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{row.description}</p>
      {row.attachmentUrls && row.attachmentUrls.length > 0 ? (
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Attachments</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {row.attachmentUrls.map((url) => (
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
      <PortalTableDetailActions>
        <Button
          type="button"
          variant="outline"
          className={`${PORTAL_DETAIL_BTN} border-rose-200 text-rose-800 hover:bg-[var(--status-overdue-bg)]`}
          disabled={deletingId === row.id}
          onClick={() => void handleDelete(row)}
        >
          {deletingId === row.id ? "Deleting…" : "Delete"}
        </Button>
      </PortalTableDetailActions>
    </>
  );

  const body =
    myRows.length === 0 ? (
      <PortalDataTableEmpty message="No feedback yet." icon="feedback" />
    ) : (
      <>
        <div className="space-y-2 lg:hidden">
          {myRows.map((row) => {
            const open = expandedId === row.id;
            return (
              <div key={row.id} className={PORTAL_MOBILE_CARD_CLASS}>
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => setExpandedId((cur) => (cur === row.id ? null : row.id))}
                  aria-expanded={open}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{row.title}</p>
                      <p className="mt-0.5 truncate text-xs text-muted">Submitted {formatWhen(row.createdAt)}</p>
                    </div>
                    <span
                      className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${feedbackStatusClass(row.status)}`}
                    >
                      {row.status}
                    </span>
                  </div>
                </button>
                {open ? <div className="mt-3 border-t border-border pt-3">{renderRowDetail(row)}</div> : null}
              </div>
            );
          })}
        </div>
        <div className={`${PORTAL_DATA_TABLE_WRAP} hidden lg:block`}>
          <div className={PORTAL_DATA_TABLE_SCROLL}>
            <table className="w-full table-fixed border-collapse text-left text-sm">
              <thead>
                <tr className={PORTAL_TABLE_HEAD_ROW}>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Submitted</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Title</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
                </tr>
              </thead>
              <tbody>
                {myRows.map((row) => {
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
                        <td className={`${PORTAL_TABLE_TD} font-medium text-foreground`}>{row.title}</td>
                        <td className={PORTAL_TABLE_TD}>
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${feedbackStatusClass(row.status)}`}
                          >
                            {row.status}
                          </span>
                        </td>
                      </tr>
                      {open ? (
                        <tr className={PORTAL_TABLE_DETAIL_ROW}>
                          <td colSpan={3} className={PORTAL_TABLE_DETAIL_CELL}>
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

  const addFeedbackButton = (
    <PortalSectionPrimaryButton onClick={() => setSubmitOpen(true)} data-attr="feedback-add">
      Add feedback
    </PortalSectionPrimaryButton>
  );

  return (
    <>
      {embedded ? (
        <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)] sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-semibold text-foreground">Feedback</p>
            {addFeedbackButton}
          </div>
          {body}
        </div>
      ) : (
        <ManagerPortalPageShell title="Feedback" titleAside={addFeedbackButton}>
          {body}
        </ManagerPortalPageShell>
      )}

      <PortalFeedbackSubmitModal
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        reporterRole={reporterRole}
        reporterUserId={session.userId}
        reporterEmail={session.email ?? ""}
        reporterName={session.email ?? ""}
        onSubmitted={refresh}
      />
    </>
  );
}
