"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ManagerPortalFilterRow, MANAGER_TABLE_TH, PORTAL_TOOLBAR_SELECT, PortalToolbarSelectWrap } from "@/components/portal/portal-metrics";
import {
  INBOX_SCHEDULE_TABLE_COLUMN_WEIGHTS,
  PORTAL_DATA_TABLE,
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PORTAL_MOBILE_CARD_CLASS,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TR_EXPANDABLE,
  PORTAL_TABLE_TD,
  PortalDataTableColGroup,
  PortalTableInlineExpand,
  createPortalRowExpandClick,
  portalTableColumnPercents,
} from "@/components/portal/portal-data-table";
import { PortalInboxEmptyState } from "@/components/portal/portal-inbox-ui";
import { readPortalApiError } from "@/lib/portal-api-error";
import {
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

  const loading = automationLoading || manualLoading;

  const reloadAll = () => {
    void reloadAutomation();
    void reloadManual();
  };

  const toggleManualCancelled = async (message: ScheduledInboxMessageRecord, cancelled: boolean) => {
    const res = await fetch(`/api/portal/scheduled-inbox-messages/${encodeURIComponent(message.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ cancelled }),
    });
    if (!res.ok) {
      throw new Error(await readPortalApiError(res, "Could not update."));
    }
  };

  const toggleRowExpand = (row: ScheduleRow) => {
    const id = rowId(row);
    setExpandedRowId((cur) => (cur === id ? null : id));
  };

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
      let lastError: string | null = null;
      for (const row of targets) {
        try {
          await sendRowNow(row);
          ok += 1;
        } catch (e) {
          lastError = e instanceof Error ? e.message : "Could not send message.";
        }
      }
      if (ok === 0) {
        showToast(lastError ?? "Could not send messages.");
        return;
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
      let ok = 0;
      let lastError: string | null = null;
      for (const row of targets) {
        try {
          if (row.kind === "manual") {
            await toggleManualCancelled(row.message, true);
          } else {
            await patchScheduledMessage(row.message.id, { cancelled: true });
          }
          ok += 1;
        } catch (e) {
          lastError = e instanceof Error ? e.message : "Could not cancel send.";
        }
      }
      if (ok === 0) {
        showToast(lastError ?? "Could not cancel sends.");
        return;
      }
      showToast(ok === 1 ? "Send cancelled." : `Cancelled ${ok} sends.`);
      clearSelection();
      reloadAll();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not cancel sends.");
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
          try {
            await toggleManualCancelled(row.message, cancelled);
            showToast(cancelled ? "Send cancelled." : "Send restored.");
            setExpandedRowId(null);
            reloadAll();
          } catch (e) {
            showToast(e instanceof Error ? e.message : "Could not update.");
          }
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
      <ManagerPortalFilterRow>
        <label className="inline-flex items-center gap-2 text-xs font-medium text-muted">
          <span className="sr-only">Show messages scheduled within</span>
          <PortalToolbarSelectWrap>
            <select
              className={`${PORTAL_TOOLBAR_SELECT} h-9 text-xs font-semibold`}
              value={horizonId}
              onChange={(e) => setHorizonId(e.target.value as InboxScheduleHorizonId)}
            >
              {INBOX_SCHEDULE_HORIZON_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </PortalToolbarSelectWrap>
        </label>
        {selectedIds.size > 0 ? (
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="primary"
              className="rounded-full"
              disabled={bulkBusy}
              onClick={() => void bulkSendNow()}
            >
              Send now
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              disabled={bulkBusy}
              onClick={() => void bulkCancelSend()}
            >
              Cancel send
            </Button>
            <Button type="button" variant="outline" className="rounded-full" onClick={clearSelection}>
              Clear
            </Button>
          </div>
        ) : null}
      </ManagerPortalFilterRow>

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
              const subject = row.message.subject;
              const status = row.message.status;
              const sendLabel = formatScheduledSendAt(row.message.sendAt);
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
                      <PortalTableInlineExpand expanded={isRowExpanded} className="font-semibold text-foreground">
                        {recipientName}
                      </PortalTableInlineExpand>
                      <p className="mt-0.5 truncate text-xs text-muted">{recipientEmail}</p>
                      <p className="mt-1 truncate text-xs text-muted">{sendLabel}</p>
                      <p className="mt-0.5 truncate text-xs font-medium text-foreground">{subject}</p>
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
                <PortalDataTableColGroup
                  percents={portalTableColumnPercents(4, INBOX_SCHEDULE_TABLE_COLUMN_WEIGHTS)}
                />
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
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Recipient</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Send date &amp; time</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Subject</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const id = rowId(row);
                    const isManual = row.kind === "manual";
                    const recipientName = isManual ? row.message.recipientName : row.message.residentName;
                    const recipientEmail = isManual ? row.message.recipientEmail : row.message.residentEmail;
                    const subject = row.message.subject;
                    const status = row.message.status;
                    const sendLabel = formatScheduledSendAt(row.message.sendAt);
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
                          <td className={PORTAL_TABLE_TD}>
                            <PortalTableInlineExpand expanded={isRowExpanded} className="font-medium text-foreground">
                              {recipientName}
                            </PortalTableInlineExpand>
                            <div className="text-xs text-muted">{recipientEmail}</div>
                          </td>
                          <td className={`${PORTAL_TABLE_TD} text-muted`}>{sendLabel}</td>
                          <td className={`${PORTAL_TABLE_TD} font-medium text-foreground`}>{subject}</td>
                        </tr>
                        {isRowExpanded ? (
                          <tr className={PORTAL_TABLE_DETAIL_ROW}>
                            <td colSpan={4} className={PORTAL_TABLE_DETAIL_CELL}>
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
