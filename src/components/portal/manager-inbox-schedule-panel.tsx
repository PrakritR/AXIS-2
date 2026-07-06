"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";
import {
  PORTAL_DATA_TABLE,
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PORTAL_MOBILE_CARD_CLASS,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TR_EXPANDABLE,
  PORTAL_TABLE_TD,
  createPortalRowExpandClick,
} from "@/components/portal/portal-data-table";
import { PortalInboxEmptyState } from "@/components/portal/portal-inbox-ui";
import {
  PortalInboxSelectionToolbar,
  sendAutomationScheduledMessageNow,
  sendManualScheduledMessageNow,
  useInboxRowSelection,
} from "@/components/portal/portal-inbox-selection";
import { ScheduleInboxComposeForm } from "@/components/portal/schedule-inbox-compose-modal";
import {
  ScheduledMessageEditForm,
  patchScheduledMessage,
  useScheduledPaymentMessages,
} from "@/components/portal/payment-schedule-ui";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { MANAGER_APPLICATIONS_EVENT } from "@/lib/manager-applications-storage";
import { buildManagerInboxLiveContacts } from "@/lib/manager-inbox-contacts";
import {
  INBOX_SCHEDULE_HORIZON_OPTIONS,
  inboxScheduleHorizonDays,
  sendAtWithinScheduleHorizon,
  type InboxScheduleHorizonId,
} from "@/lib/inbox-schedule-horizon";
import {
  isUpcomingScheduledInboxMessage,
  type ScheduledInboxMessageRecord,
} from "@/lib/scheduled-inbox-messages";
import {
  formatScheduledSendAt,
  type ScheduledPaymentMessage,
} from "@/lib/scheduled-payment-messages";

function messagePreview(body: string, max = 120): string {
  const text = body.trim().replace(/\s+/g, " ");
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function statusClass(status: string): string {
  if (status === "sent") return "text-emerald-700";
  if (status === "cancelled") return "text-muted line-through";
  return "text-primary";
}

type ScheduleRow =
  | { kind: "manual"; message: ScheduledInboxMessageRecord }
  | { kind: "automation"; message: ScheduledPaymentMessage };

function rowId(row: ScheduleRow): string {
  return row.kind === "manual" ? row.message.id : row.message.id;
}

export function ManagerInboxSchedulePanel({
  portalBase,
  filterResidentEmail,
}: {
  portalBase: string;
  /** When set, only show scheduled messages addressed to this resident (case-insensitive). */
  filterResidentEmail?: string;
}) {
  void portalBase;
  const { showToast } = useAppUi();
  const { userId } = useManagerUserId();
  const [horizonId, setHorizonId] = useState<InboxScheduleHorizonId>("14");
  const horizonDays = inboxScheduleHorizonDays(horizonId);

  const { messages: automationMessages, loading: automationLoading, reload: reloadAutomation } =
    useScheduledPaymentMessages({ includeHidden: true });

  const [manualMessages, setManualMessages] = useState<ScheduledInboxMessageRecord[]>([]);
  const [manualLoading, setManualLoading] = useState(true);
  const [contactTick, setContactTick] = useState(0);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const reloadManual = useCallback(async () => {
    setManualLoading(true);
    try {
      const res = await fetch("/api/portal/scheduled-inbox-messages", { credentials: "include", cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { messages?: ScheduledInboxMessageRecord[] };
      setManualMessages(Array.isArray(body.messages) ? body.messages : []);
    } finally {
      setManualLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void reloadManual());
  }, [reloadManual]);

  useEffect(() => {
    const bump = () => setContactTick((n) => n + 1);
    window.addEventListener(MANAGER_APPLICATIONS_EVENT, bump);
    window.addEventListener("axis-pro-relationships", bump);
    return () => {
      window.removeEventListener(MANAGER_APPLICATIONS_EVENT, bump);
      window.removeEventListener("axis-pro-relationships", bump);
    };
  }, []);

  const liveContacts = useMemo(() => {
    void contactTick;
    return buildManagerInboxLiveContacts(userId);
  }, [userId, contactTick]);

  const rows = useMemo((): ScheduleRow[] => {
    const manual: ScheduleRow[] = manualMessages
      .filter((message) => isUpcomingScheduledInboxMessage(message.sendAt, message.status))
      .map((message) => ({ kind: "manual", message }));
    const automation: ScheduleRow[] = automationMessages.map((message) => ({ kind: "automation", message }));
    const targetEmail = filterResidentEmail?.trim().toLowerCase();
    return [...manual, ...automation]
      .filter((row) => sendAtWithinScheduleHorizon(row.message.sendAt, horizonDays))
      .filter((row) => {
        if (!targetEmail) return true;
        const recipientEmail = row.kind === "manual" ? row.message.recipientEmail : row.message.residentEmail;
        return (recipientEmail ?? "").trim().toLowerCase() === targetEmail;
      })
      .sort((a, b) => a.message.sendAt.localeCompare(b.message.sendAt));
  }, [manualMessages, automationMessages, horizonDays, filterResidentEmail]);

  const selectableIds = useMemo(
    () => rows.filter((row) => row.message.status === "scheduled").map((row) => rowId(row)),
    [rows],
  );
  const { selectedIds, allSelected, toggleSelected, toggleSelectAll, clearSelection } =
    useInboxRowSelection(selectableIds);

  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIds.has(rowId(row))),
    [rows, selectedIds],
  );

  const scheduledCount = useMemo(
    () => rows.filter((row) => row.message.status === "scheduled").length,
    [rows],
  );

  const loading = automationLoading || manualLoading;

  const reloadAll = () => {
    void reloadAutomation();
    void reloadManual();
  };

  const toggleManualCancelled = async (message: ScheduledInboxMessageRecord, cancelled: boolean) => {
    try {
      const res = await fetch(`/api/portal/scheduled-inbox-messages/${encodeURIComponent(message.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ cancelled }),
      });
      if (!res.ok) throw new Error("Could not update.");
      showToast(cancelled ? "Send cancelled." : "Send restored.");
      reloadAll();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not update.");
    }
  };

  const toggleRowExpand = (row: ScheduleRow) => {
    const id = rowId(row);
    setExpandedRowId((cur) => (cur === id ? null : id));
  };

  const horizonLabel = INBOX_SCHEDULE_HORIZON_OPTIONS.find((opt) => opt.id === horizonId)?.label ?? "Show upcoming";

  const sendRowNow = async (row: ScheduleRow) => {
    if (row.message.status !== "scheduled") return;
    if (row.kind === "manual") {
      await sendManualScheduledMessageNow(row.message.id);
    } else {
      await sendAutomationScheduledMessageNow(row.message.id);
    }
  };

  const bulkSendNow = async () => {
    const targets = selectedRows.filter((row) => row.message.status === "scheduled");
    if (targets.length === 0) return;
    setBulkBusy(true);
    try {
      let ok = 0;
      for (const row of targets) {
        try {
          await sendRowNow(row);
          ok += 1;
        } catch {
          /* continue */
        }
      }
      showToast(ok === 1 ? "Message sent." : `Sent ${ok} of ${targets.length} messages.`);
      clearSelection();
      reloadAll();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not send messages.");
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkCancelSend = async () => {
    const targets = selectedRows.filter((row) => row.message.status === "scheduled");
    if (targets.length === 0) return;
    setBulkBusy(true);
    try {
      for (const row of targets) {
        if (row.kind === "manual") {
          await toggleManualCancelled(row.message, true);
        } else {
          await patchScheduledMessage(row.message.id, { cancelled: true });
        }
      }
      showToast(targets.length === 1 ? "Send cancelled." : `Cancelled ${targets.length} sends.`);
      clearSelection();
      reloadAll();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not cancel sends.");
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkRestoreSend = async () => {
    const targets = selectedRows.filter((row) => row.message.status === "cancelled");
    if (targets.length === 0) return;
    setBulkBusy(true);
    try {
      for (const row of targets) {
        if (row.kind === "manual") {
          await toggleManualCancelled(row.message, false);
        } else {
          await patchScheduledMessage(row.message.id, { cancelled: false });
        }
      }
      showToast(targets.length === 1 ? "Send restored." : `Restored ${targets.length} sends.`);
      clearSelection();
      reloadAll();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not restore sends.");
    } finally {
      setBulkBusy(false);
    }
  };

  const renderRowEditPanel = (row: ScheduleRow) =>
    row.kind === "manual" ? (
      <ScheduleInboxComposeForm
        contacts={liveContacts}
        editMessage={row.message}
        onSaved={reloadAll}
        onClose={() => setExpandedRowId(null)}
        onToggleCancelled={async (cancelled) => {
          await toggleManualCancelled(row.message, cancelled);
          setExpandedRowId(null);
        }}
        onSendNow={async () => {
          await sendRowNow(row);
          showToast("Message sent.");
          setExpandedRowId(null);
          reloadAll();
        }}
      />
    ) : (
      <ScheduledMessageEditForm
        message={row.message}
        onSaved={reloadAll}
        onClose={() => setExpandedRowId(null)}
        onSendNow={async () => {
          await sendRowNow(row);
          showToast("Reminder sent.");
          setExpandedRowId(null);
          reloadAll();
        }}
      />
    );

  return (
    <div className="space-y-4">
      <PortalInboxSelectionToolbar count={selectedIds.size} onClear={clearSelection}>
        <Button type="button" variant="primary" className="rounded-full" disabled={bulkBusy} onClick={() => void bulkSendNow()}>
          Send now
        </Button>
        <Button type="button" variant="outline" className="rounded-full" disabled={bulkBusy} onClick={() => void bulkCancelSend()}>
          Cancel send
        </Button>
        <Button type="button" variant="outline" className="rounded-full" disabled={bulkBusy} onClick={() => void bulkRestoreSend()}>
          Restore send
        </Button>
      </PortalInboxSelectionToolbar>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          {scheduledCount} scheduled in view · {horizonLabel.toLowerCase()}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 text-xs font-medium text-muted">
            <span className="sr-only">Show messages scheduled within</span>
            <select
              className="h-9 rounded-full border border-border bg-card px-3 text-xs font-semibold text-foreground outline-none focus:border-primary"
              value={horizonId}
              onChange={(e) => setHorizonId(e.target.value as InboxScheduleHorizonId)}
            >
              {INBOX_SCHEDULE_HORIZON_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading schedule…</p>
      ) : rows.length === 0 ? (
        <PortalInboxEmptyState title="No scheduled messages in this window." />
      ) : (
        <>
          <div className="space-y-2 lg:hidden">
            {rows.map((row) => {
              const id = rowId(row);
              const isManual = row.kind === "manual";
              const recipientName = isManual ? row.message.recipientName : row.message.residentName;
              const recipientEmail = isManual ? row.message.recipientEmail : row.message.residentEmail;
              const topic = isManual ? "Inbox message" : row.message.chargeTitle;
              const topicMeta = isManual ? null : row.message.propertyLabel;
              const subject = row.message.subject;
              const body = row.message.body;
              const status = row.message.status;
              const sendAt = row.message.sendAt;
              const sendLabel = formatScheduledSendAt(sendAt);

              const isRowExpanded = expandedRowId === id;

              return (
                <div key={id} className={PORTAL_MOBILE_CARD_CLASS}>
                  <div className="flex items-start gap-3">
                    {status === "scheduled" ? (
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 shrink-0 rounded border-border accent-primary"
                        checked={selectedIds.has(id)}
                        onChange={() => toggleSelected(id)}
                        aria-label={`Select ${subject}`}
                      />
                    ) : (
                      <span className="w-4 shrink-0" />
                    )}
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => toggleRowExpand(row)}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate font-semibold text-foreground">{subject}</p>
                      <span className="shrink-0 rounded-full border border-border bg-accent/30 px-2 py-0.5 text-[11px] font-medium text-muted">
                        {isManual ? "Manual" : "Automated"}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted">
                      {recipientName} · {recipientEmail}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {[topic, topicMeta].filter(Boolean).join(" · ")}
                      {!isManual && row.message.dueDateLabel ? ` · Due ${row.message.dueDateLabel}` : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">{sendLabel}</p>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted">{messagePreview(body)}</p>
                    <p className={`mt-1.5 text-xs font-medium capitalize ${statusClass(status)}`}>{status}</p>
                    </button>
                  </div>
                  {isRowExpanded ? (
                    <div className="mt-3 border-t border-border pt-3">{renderRowEditPanel(row)}</div>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className={`${PORTAL_DATA_TABLE_WRAP} hidden lg:block`}>
            <div className={PORTAL_DATA_TABLE_SCROLL}>
              <table className={PORTAL_DATA_TABLE}>
              <thead>
                <tr className={PORTAL_TABLE_HEAD_ROW}>
                  <th className={`${MANAGER_TABLE_TH} w-10 text-left`}>
                    {selectableIds.length > 0 ? (
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-border accent-primary"
                        checked={allSelected}
                        onChange={() => toggleSelectAll()}
                        aria-label="Select all scheduled messages"
                      />
                    ) : null}
                  </th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Send date &amp; time</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Source</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Recipient</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Topic</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Subject</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Message</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const id = rowId(row);
                  const isManual = row.kind === "manual";
                  const recipientName = isManual ? row.message.recipientName : row.message.residentName;
                  const recipientEmail = isManual ? row.message.recipientEmail : row.message.residentEmail;
                  const topic = isManual ? "Inbox message" : row.message.chargeTitle;
                  const topicMeta = isManual ? null : row.message.propertyLabel;
                  const subject = row.message.subject;
                  const body = row.message.body;
                  const status = row.message.status;
                  const sendAt = row.message.sendAt;
                  const sendLabel = formatScheduledSendAt(sendAt);

                  const isRowExpanded = expandedRowId === id;

                  return (
                    <Fragment key={id}>
                      <tr
                        className={PORTAL_TABLE_TR_EXPANDABLE}
                        onClick={createPortalRowExpandClick(() => toggleRowExpand(row))}
                        aria-expanded={isRowExpanded}
                      >
                        <td className={`${PORTAL_TABLE_TD} w-10 align-middle`}>
                          {status === "scheduled" ? (
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-border accent-primary"
                              checked={selectedIds.has(id)}
                              onChange={() => toggleSelected(id)}
                              onClick={(e) => e.stopPropagation()}
                              aria-label={`Select ${subject}`}
                            />
                          ) : null}
                        </td>
                        <td className={PORTAL_TABLE_TD}>{sendLabel}</td>
                        <td className={PORTAL_TABLE_TD}>
                          <span className="rounded-full border border-border bg-accent/30 px-2 py-0.5 text-[11px] font-medium text-muted">
                            {isManual ? "Manual" : "Automated"}
                          </span>
                        </td>
                        <td className={PORTAL_TABLE_TD}>
                          <div className="font-medium">{recipientName}</div>
                          <div className="text-xs text-muted">{recipientEmail}</div>
                        </td>
                        <td className={PORTAL_TABLE_TD}>
                          <div>{topic}</div>
                          {topicMeta ? <div className="text-xs text-muted">{topicMeta}</div> : null}
                          {!isManual && row.message.dueDateLabel ? (
                            <div className="text-xs text-muted">Due {row.message.dueDateLabel}</div>
                          ) : null}
                        </td>
                        <td className={`${PORTAL_TABLE_TD} max-w-[180px]`}>
                          <div className="truncate font-medium text-foreground">{subject}</div>
                        </td>
                        <td className={`${PORTAL_TABLE_TD} max-w-[240px]`}>
                          <p className="line-clamp-2 text-xs leading-relaxed text-muted">{messagePreview(body)}</p>
                        </td>
                        <td className={`${PORTAL_TABLE_TD} capitalize ${statusClass(status)}`}>{status}</td>
                      </tr>
                      {isRowExpanded ? (
                        <tr className={PORTAL_TABLE_DETAIL_ROW}>
                          <td colSpan={8} className={PORTAL_TABLE_DETAIL_CELL}>
                            {renderRowEditPanel(row)}
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
      )}
    </div>
  );
}

/** @deprecated Import from payment-schedule-ui */
export { ChargeReminderList, ChargeReminderList as ScheduledReminderChips } from "@/components/portal/payment-schedule-ui";
