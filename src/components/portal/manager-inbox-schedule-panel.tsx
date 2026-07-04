"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { MANAGER_TABLE_TH, PORTAL_HEADER_ACTION_BTN } from "@/components/portal/portal-metrics";
import {
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PORTAL_MOBILE_CARD_CLASS,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TR_EXPANDABLE,
  PORTAL_TABLE_TD,
} from "@/components/portal/portal-data-table";
import { PortalInboxEmptyState } from "@/components/portal/portal-inbox-ui";
import { ScheduleInboxComposeModal } from "@/components/portal/schedule-inbox-compose-modal";
import {
  ScheduledMessageEditModal,
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
  inboxScheduleTypeLabel,
  type ScheduledPaymentMessage,
} from "@/lib/scheduled-payment-messages";

function formatSendDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

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
  const [composeOpen, setComposeOpen] = useState(false);
  const [editAutomation, setEditAutomation] = useState<ScheduledPaymentMessage | null>(null);
  const [editManual, setEditManual] = useState<ScheduledInboxMessageRecord | null>(null);

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

  const openRowEdit = (row: ScheduleRow) => {
    if (row.kind === "manual") setEditManual(row.message);
    else setEditAutomation(row.message);
  };

  const horizonLabel = INBOX_SCHEDULE_HORIZON_OPTIONS.find((opt) => opt.id === horizonId)?.label ?? "Show upcoming";

  return (
    <div className="space-y-4">
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
          <Button type="button" variant="primary" className={`rounded-full text-xs ${PORTAL_HEADER_ACTION_BTN}`} onClick={() => setComposeOpen(true)}>
            Schedule message
          </Button>
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
              const timing = isManual
                ? "Scheduled send"
                : inboxScheduleTypeLabel(row.message.kind, row.message.daysBeforeDue);
              const subject = row.message.subject;
              const body = row.message.body;
              const status = row.message.status;
              const sendAt = row.message.sendAt;

              return (
                <div key={id} className={PORTAL_MOBILE_CARD_CLASS}>
                  <button type="button" className="w-full text-left" onClick={() => openRowEdit(row)}>
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
                    <p className="mt-0.5 text-xs text-muted">
                      {formatSendDate(sendAt)} · {timing}
                    </p>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted">{messagePreview(body)}</p>
                    <p className={`mt-1.5 text-xs font-medium capitalize ${statusClass(status)}`}>{status}</p>
                  </button>
                </div>
              );
            })}
          </div>
          <div className={`${PORTAL_DATA_TABLE_WRAP} hidden lg:block`}>
            <div className={PORTAL_DATA_TABLE_SCROLL}>
              <table className="w-full min-w-[1024px] text-sm">
              <thead>
                <tr className={PORTAL_TABLE_HEAD_ROW}>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Send date</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Source</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Recipient</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Topic</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Timing</th>
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
                  const timing = isManual
                    ? "Scheduled send"
                    : inboxScheduleTypeLabel(row.message.kind, row.message.daysBeforeDue);
                  const subject = row.message.subject;
                  const body = row.message.body;
                  const status = row.message.status;
                  const sendAt = row.message.sendAt;

                  return (
                    <Fragment key={id}>
                      <tr
                        className={`${PORTAL_TABLE_TR_EXPANDABLE} cursor-pointer`}
                        onClick={() => openRowEdit(row)}
                      >
                        <td className={PORTAL_TABLE_TD}>{formatSendDate(sendAt)}</td>
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
                        <td className={PORTAL_TABLE_TD}>{timing}</td>
                        <td className={`${PORTAL_TABLE_TD} max-w-[180px]`}>
                          <div className="truncate font-medium text-foreground">{subject}</div>
                        </td>
                        <td className={`${PORTAL_TABLE_TD} max-w-[240px]`}>
                          <p className="line-clamp-2 text-xs leading-relaxed text-muted">{messagePreview(body)}</p>
                        </td>
                        <td className={`${PORTAL_TABLE_TD} capitalize ${statusClass(status)}`}>{status}</td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          </div>
        </>
      )}

      <ScheduleInboxComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onSaved={reloadAll}
        contacts={liveContacts}
      />
      <ScheduleInboxComposeModal
        open={Boolean(editManual)}
        onClose={() => setEditManual(null)}
        onSaved={reloadAll}
        contacts={liveContacts}
        editMessage={editManual}
        onToggleCancelled={
          editManual
            ? async (cancelled) => {
                await toggleManualCancelled(editManual, cancelled);
                setEditManual(null);
              }
            : undefined
        }
      />
      <ScheduledMessageEditModal
        open={Boolean(editAutomation)}
        message={editAutomation}
        onClose={() => setEditAutomation(null)}
        onSaved={reloadAll}
      />
    </div>
  );
}

/** @deprecated Import from payment-schedule-ui */
export { ChargeReminderList, ChargeReminderList as ScheduledReminderChips } from "@/components/portal/payment-schedule-ui";
