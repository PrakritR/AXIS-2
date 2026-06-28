"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";
import { PORTAL_DATA_TABLE_WRAP, PORTAL_TABLE_HEAD_ROW, PORTAL_TABLE_TR, PORTAL_TABLE_TD } from "@/components/portal/portal-data-table";
import { PortalInboxEmptyState } from "@/components/portal/portal-inbox-ui";
import {
  PaymentAutomationSettingsPanel,
  ScheduledMessageEditModal,
  useScheduledPaymentMessages,
} from "@/components/portal/payment-schedule-ui";
import type { ScheduledPaymentMessage } from "@/lib/scheduled-payment-messages";

function formatSendDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function statusClass(status: ScheduledPaymentMessage["status"]): string {
  if (status === "sent") return "text-emerald-700";
  if (status === "cancelled") return "text-muted line-through";
  return "text-primary";
}

export function ManagerInboxSchedulePanel({ portalBase }: { portalBase: string }) {
  const { settings, messages, loading, reload, setSettings } = useScheduledPaymentMessages();
  const [editMessage, setEditMessage] = useState<ScheduledPaymentMessage | null>(null);
  const [showSettings, setShowSettings] = useState(true);

  const scheduledCount = useMemo(() => messages.filter((m) => m.status === "scheduled").length, [messages]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          {scheduledCount} upcoming automated reminder{scheduledCount === 1 ? "" : "s"}
        </p>
        <Button type="button" variant="outline" className="rounded-full text-xs" onClick={() => setShowSettings((v) => !v)}>
          {showSettings ? "Hide settings" : "Reminder settings"}
        </Button>
      </div>

      {showSettings && settings ? (
        <PaymentAutomationSettingsPanel settings={settings} onSaved={(next) => { setSettings(next); void reload(); }} />
      ) : null}

      {loading ? (
        <p className="text-sm text-muted">Loading schedule…</p>
      ) : messages.length === 0 ? (
        <PortalInboxEmptyState
          title="No scheduled reminders yet"
          hint={
            <p className="max-w-md">
              Pending rent and overdue charges will appear here based on your settings. Adjust timing above or on the{" "}
              <Link href={`${portalBase}/payments`} className="font-semibold text-primary hover:underline">
                Payments
              </Link>{" "}
              tab.
            </p>
          }
        />
      ) : (
        <div className={PORTAL_DATA_TABLE_WRAP}>
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className={PORTAL_TABLE_HEAD_ROW}>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Send date</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Resident</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Charge</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Type</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Subject</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((row) => (
                <tr key={row.id} className={PORTAL_TABLE_TR}>
                  <td className={PORTAL_TABLE_TD}>{formatSendDate(row.sendAt)}</td>
                  <td className={PORTAL_TABLE_TD}>
                    <div className="font-medium">{row.residentName}</div>
                    <div className="text-xs text-muted">{row.residentEmail}</div>
                  </td>
                  <td className={PORTAL_TABLE_TD}>
                    <div>{row.chargeTitle}</div>
                    <div className="text-xs text-muted">{row.propertyLabel}</div>
                  </td>
                  <td className={PORTAL_TABLE_TD}>{row.typeLabel}</td>
                  <td className={`${PORTAL_TABLE_TD} max-w-[200px] truncate`}>{row.subject}</td>
                  <td className={`${PORTAL_TABLE_TD} capitalize ${statusClass(row.status)}`}>{row.status}</td>
                  <td className={PORTAL_TABLE_TD}>
                    {row.status === "scheduled" || row.status === "cancelled" ? (
                      <Button type="button" variant="outline" className="rounded-full px-2 py-0.5 text-xs" onClick={() => setEditMessage(row)}>
                        Edit
                      </Button>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ScheduledMessageEditModal
        open={Boolean(editMessage)}
        message={editMessage}
        onClose={() => setEditMessage(null)}
        onSaved={() => void reload()}
      />
    </div>
  );
}

export function ScheduledReminderChips({
  messages,
  onEdit,
}: {
  messages: ScheduledPaymentMessage[];
  onEdit?: (message: ScheduledPaymentMessage) => void;
}) {
  if (!messages.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {messages.map((m) => (
        <button
          key={m.id}
          type="button"
          className="rounded-full border border-border bg-accent/30 px-2 py-0.5 text-[11px] text-muted hover:border-primary/40"
          onClick={() => onEdit?.(m)}
        >
          {formatSendDate(m.sendAt)} · {m.typeLabel}
        </button>
      ))}
    </div>
  );
}
