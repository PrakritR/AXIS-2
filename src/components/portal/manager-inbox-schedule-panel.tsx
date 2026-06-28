"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MANAGER_TABLE_TH, PORTAL_HEADER_ACTION_BTN } from "@/components/portal/portal-metrics";
import {
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_ROW_TOGGLE_CLASS,
  PORTAL_TABLE_TR,
  PORTAL_TABLE_TD,
} from "@/components/portal/portal-data-table";
import { PortalInboxEmptyState } from "@/components/portal/portal-inbox-ui";
import { ScheduleInboxComposeModal } from "@/components/portal/schedule-inbox-compose-modal";
import {
  PaymentAutomationSettingsPanel,
  ScheduledMessageEditModal,
  useScheduledPaymentMessages,
} from "@/components/portal/payment-schedule-ui";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import type { InboxScopedContact } from "@/data/inbox-scoped-directory";
import { MANAGER_APPLICATIONS_EVENT, readManagerApplicationRows } from "@/lib/manager-applications-storage";
import { readProRelationships } from "@/lib/pro-relationships";
import type { ScheduledInboxMessageRecord } from "@/lib/scheduled-inbox-messages";
import {
  inboxScheduleTypeLabel,
  scheduledReminderShortLabel,
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

export function ManagerInboxSchedulePanel({ portalBase }: { portalBase: string }) {
  const { showToast } = useAppUi();
  const { userId } = useManagerUserId();
  const { settings, messages: automationMessages, loading: automationLoading, reload: reloadAutomation, setSettings } =
    useScheduledPaymentMessages({ includeHidden: true });

  const [manualMessages, setManualMessages] = useState<ScheduledInboxMessageRecord[]>([]);
  const [manualLoading, setManualLoading] = useState(true);
  const [contactTick, setContactTick] = useState(0);
  const [composeOpen, setComposeOpen] = useState(false);
  const [editAutomation, setEditAutomation] = useState<ScheduledPaymentMessage | null>(null);
  const [editManual, setEditManual] = useState<ScheduledInboxMessageRecord | null>(null);
  const [showAutomationSettings, setShowAutomationSettings] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
    void reloadManual();
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

  const liveContacts = useMemo((): InboxScopedContact[] => {
    void contactTick;
    const out: InboxScopedContact[] = [];
    const seen = new Set<string>();
    for (const row of readManagerApplicationRows()) {
      if (row.bucket !== "approved" || !row.email?.trim()) continue;
      const email = row.email.trim().toLowerCase();
      if (seen.has(email)) continue;
      seen.add(email);
      out.push({ id: `res-${row.id}`, name: row.name || email, email: row.email.trim(), role: "resident" });
    }
    if (userId) {
      for (const rel of readProRelationships(userId)) {
        const email = rel.linkedAxisId.trim();
        if (!email || seen.has(email.toLowerCase())) continue;
        seen.add(email.toLowerCase());
        out.push({ id: `rel-${rel.id}`, name: rel.linkedDisplayName || rel.linkedAxisId, email: rel.linkedAxisId, role: "manager" });
      }
    }
    return out;
  }, [userId, contactTick]);

  const rows = useMemo((): ScheduleRow[] => {
    const manual: ScheduleRow[] = manualMessages.map((message) => ({ kind: "manual", message }));
    const automation: ScheduleRow[] = automationMessages.map((message) => ({ kind: "automation", message }));
    return [...manual, ...automation].sort((a, b) => {
      const aAt = a.kind === "manual" ? a.message.sendAt : a.message.sendAt;
      const bAt = b.kind === "manual" ? b.message.sendAt : b.message.sendAt;
      return aAt.localeCompare(bAt);
    });
  }, [manualMessages, automationMessages]);

  const scheduledCount = useMemo(
    () =>
      manualMessages.filter((m) => m.status === "scheduled").length +
      automationMessages.filter((m) => m.status === "scheduled").length,
    [manualMessages, automationMessages],
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          {scheduledCount} upcoming scheduled message{scheduledCount === 1 ? "" : "s"}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" className="rounded-full text-xs" onClick={() => setShowAutomationSettings((v) => !v)}>
            {showAutomationSettings ? "Hide automation settings" : "Automation settings"}
          </Button>
          <Button type="button" variant="primary" className={`rounded-full text-xs ${PORTAL_HEADER_ACTION_BTN}`} onClick={() => setComposeOpen(true)}>
            Schedule message
          </Button>
        </div>
      </div>

      {showAutomationSettings && settings ? (
        <PaymentAutomationSettingsPanel
          variant="inbox"
          settings={settings}
          onSaved={(next) => {
            setSettings(next);
            reloadAll();
          }}
        />
      ) : null}

      {loading ? (
        <p className="text-sm text-muted">Loading schedule…</p>
      ) : rows.length === 0 ? (
        <PortalInboxEmptyState
          title="No scheduled messages yet"
          hint={
            <p className="max-w-md">
              Schedule a message with the button above, or let automated charge reminders appear here. Charge timing is
              configured under{" "}
              <Link href={`${portalBase}/payments`} className="font-semibold text-primary hover:underline">
                Payments
              </Link>
              .
            </p>
          }
        />
      ) : (
        <div className={PORTAL_DATA_TABLE_WRAP}>
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
                  <th className={`${MANAGER_TABLE_TH} text-right`}>Actions</th>
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
                      <tr className={PORTAL_TABLE_TR}>
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
                        <td className={`${PORTAL_TABLE_TD} text-right`}>
                          <div className="inline-flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              className={PORTAL_TABLE_ROW_TOGGLE_CLASS}
                              onClick={() => setExpandedId((cur) => (cur === id ? null : id))}
                            >
                              {expandedId === id ? "Hide" : "View"}
                            </Button>
                            {status === "scheduled" || status === "cancelled" ? (
                              <Button
                                type="button"
                                variant="outline"
                                className="rounded-full px-2 py-0.5 text-xs"
                                onClick={() => {
                                  if (isManual) setEditManual(row.message);
                                  else setEditAutomation(row.message);
                                }}
                              >
                                Edit
                              </Button>
                            ) : null}
                            {isManual && status !== "sent" ? (
                              <Button
                                type="button"
                                variant="outline"
                                className="rounded-full px-2 py-0.5 text-xs"
                                onClick={() => void toggleManualCancelled(row.message, status !== "cancelled")}
                              >
                                {status === "cancelled" ? "Restore" : "Cancel"}
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      {expandedId === id ? (
                        <tr className={PORTAL_TABLE_DETAIL_ROW}>
                          <td colSpan={9} className={PORTAL_TABLE_DETAIL_CELL}>
                            <div className="space-y-3">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Subject</p>
                                <p className="mt-1 text-sm font-medium text-foreground">{subject}</p>
                              </div>
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Message</p>
                                <pre className="mt-1 whitespace-pre-wrap rounded-xl border border-border bg-accent/20 p-4 text-sm leading-relaxed text-muted">
                                  {body}
                                </pre>
                              </div>
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

export function ChargeReminderList({
  messages,
  onEdit,
  onToggleCancel,
}: {
  messages: ScheduledPaymentMessage[];
  onEdit?: (message: ScheduledPaymentMessage) => void;
  onToggleCancel?: (message: ScheduledPaymentMessage, cancelled: boolean) => void | Promise<void>;
}) {
  if (!messages.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {messages.map((m) => {
        const cancelled = m.status === "cancelled";
        const label = scheduledReminderShortLabel(m.kind, m.daysBeforeDue);
        return (
          <span
            key={m.id}
            className={`inline-flex max-w-full items-stretch overflow-hidden rounded-full border text-[11px] leading-none ${
              cancelled
                ? "border-border bg-accent/20 text-muted"
                : "border-primary/20 bg-primary/5 text-foreground"
            }`}
          >
            <button
              type="button"
              className={`px-2 py-1 text-left hover:bg-accent/40 ${cancelled ? "line-through" : ""}`}
              title={`Edit · sends ${formatSendDate(m.sendAt)}`}
              onClick={() => onEdit?.(m)}
            >
              <span className="font-medium">{label}</span>
              <span className="ml-1 text-muted">· {formatSendDate(m.sendAt)}</span>
            </button>
            {onToggleCancel ? (
              <button
                type="button"
                className="border-l border-border px-1.5 py-1 text-muted hover:bg-accent/50 hover:text-foreground"
                title={cancelled ? "Restore send" : "Cancel send"}
                aria-label={cancelled ? `Restore ${label}` : `Cancel ${label}`}
                onClick={() => void onToggleCancel(m, !cancelled)}
              >
                {cancelled ? "↺" : "×"}
              </button>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

/** @deprecated Use ChargeReminderList */
export const ScheduledReminderChips = ChargeReminderList;
