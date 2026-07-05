"use client";

import { Fragment, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";
import {
  PORTAL_DATA_TABLE,
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PortalDataTableEmpty,
  PORTAL_DETAIL_BTN,
  PORTAL_DETAIL_BTN_PRIMARY,
  PORTAL_MOBILE_CARD_CLASS,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TR_EXPANDABLE,
  PORTAL_TABLE_TD,
  PortalTableDetailActions,
  createPortalRowExpandClick,
} from "@/components/portal/portal-data-table";
import { stripPropertyRoomCountSuffix } from "@/lib/portal-mobile-preview";
import type { DemoManagerPaymentLedgerRow, ManagerPaymentBucket } from "@/data/demo-portal";
import { deleteManagerPaymentLedgerEntry, markManagerPaymentLedgerPaid, markManagerPaymentLedgerPending } from "@/lib/demo-manager-payment-ledger";
import { deleteHouseholdCharge, markHouseholdChargePaid, markHouseholdChargePending, updateHouseholdChargeAmount } from "@/lib/household-charges";
import { Input } from "@/components/ui/input";
import { PortalNotificationPreviewModal } from "@/components/portal/portal-notification-preview-modal";
import type { ScheduledPaymentMessage } from "@/lib/scheduled-payment-messages";
import { manageableRemindersForCharge } from "@/lib/scheduled-payment-messages";

function statusTone(label: string) {
  const l = label.toLowerCase();
  if (l.includes("paid")) return "portal-badge-success ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";
  if (l.includes("overdue") || l.includes("partial")) return "portal-badge-danger ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";
  if (l.includes("soon")) return "portal-badge-pending ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";
  return "bg-accent/30 text-foreground ring-1 ring-border";
}

export function ManagerPaymentsLedgerPanel({
  rows,
  managerUserId,
  activeBucket,
  scheduledMessages = [],
  onOpenReminderSettings,
  onRowsChanged,
  onScheduleChanged,
}: {
  rows: DemoManagerPaymentLedgerRow[];
  managerUserId: string | null;
  activeBucket: ManagerPaymentBucket;
  scheduledMessages?: ScheduledPaymentMessage[];
  onOpenReminderSettings?: () => void;
  onRowsChanged?: () => void;
  onScheduleChanged?: () => void;
}) {
  const { showToast } = useAppUi();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingAmountId, setEditingAmountId] = useState<string | null>(null);
  const [editAmountDraft, setEditAmountDraft] = useState("");
  const [sendingReminderId, setSendingReminderId] = useState<string | null>(null);
  const [reminderPreview, setReminderPreview] = useState<{ row: DemoManagerPaymentLedgerRow; subject: string; body: string } | null>(null);

  const openReminderPreview = (row: DemoManagerPaymentLedgerRow) => {
    const email = row.residentEmail?.trim();
    if (!email) {
      showToast("No email on file for this resident.");
      return;
    }
    const residentName = row.residentName || "Resident";
    const chargeTitle = row.chargeTitle || "outstanding charge";
    const subject = `Payment reminder: ${chargeTitle}`;
    const lines = [
      `Hi ${residentName},`,
      "",
      `This is a friendly reminder that your ${chargeTitle} payment is outstanding.`,
    ];
    if (row.balanceDue) lines.push(`Amount due: ${row.balanceDue}`);
    if (row.propertyName) lines.push(`Property: ${row.propertyName}`);
    lines.push(
      "",
      "Please log in to your Axis resident portal to make your payment at your earliest convenience.",
      "",
      "If you have any questions, please don't hesitate to reach out.",
      "",
      "Your property manager",
      "Axis Portal",
    );
    setReminderPreview({ row, subject, body: lines.join("\n") });
  };

  const doSendReminder = async (skipMessage: boolean) => {
    if (!reminderPreview) return;
    if (skipMessage) {
      setReminderPreview(null);
      return;
    }
    const { row } = reminderPreview;
    const email = row.residentEmail?.trim();
    if (!email) return;
    setReminderPreview(null);
    setSendingReminderId(row.id);
    try {
      const res = await fetch("/api/portal/send-payment-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          residentEmail: email,
          residentName: row.residentName,
          chargeTitle: row.chargeTitle,
          balanceDue: row.balanceDue,
          propertyLabel: row.propertyName,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; skipped?: boolean };
      if (data.skipped) {
        showToast("Reminder sent to portal inbox (demo email — no real email sent).");
      } else if (data.ok) {
        showToast("Reminder sent to resident via email and portal inbox.");
      } else {
        showToast("Could not send reminder. Please try again.");
      }
    } catch {
      showToast("Could not send reminder. Please try again.");
    } finally {
      setSendingReminderId(null);
    }
  };

  const hasAnySource = useMemo(() => rows.length > 0, [rows]);

  if (!hasAnySource) {
    return <PortalDataTableEmpty message="No payments in this bucket yet." icon="payment" />;
  }

  const removePayment = (row: DemoManagerPaymentLedgerRow) => {
    if (row.householdChargeId) {
      if (deleteHouseholdCharge(row.householdChargeId, managerUserId)) {
        showToast("Payment removed.");
        setExpandedId(null);
        onRowsChanged?.();
        return;
      }
      showToast("Could not remove this line.");
      return;
    }
    if (deleteManagerPaymentLedgerEntry(row.id)) {
      showToast("Payment removed.");
      setExpandedId(null);
      onRowsChanged?.();
      return;
    }
    showToast("Could not remove this line.");
  };

  const recordPaid = (row: DemoManagerPaymentLedgerRow, toastMessage: string) => {
    if (row.householdChargeId) {
      if (markHouseholdChargePaid(row.householdChargeId, managerUserId)) {
        showToast(toastMessage);
        setExpandedId(null);
        onRowsChanged?.();
        onScheduleChanged?.();
        return;
      }
      showToast("Could not update this line.");
      return;
    }
    markManagerPaymentLedgerPaid(row.id);
    showToast(toastMessage);
    setExpandedId(null);
    onRowsChanged?.();
  };

  const moveToPending = (row: DemoManagerPaymentLedgerRow) => {
    if (row.householdChargeId) {
      if (markHouseholdChargePending(row.householdChargeId, managerUserId)) {
        showToast("Moved to pending.");
        setExpandedId(null);
        onRowsChanged?.();
        return;
      }
      showToast("Could not update this line.");
      return;
    }
    markManagerPaymentLedgerPending(row.id);
    showToast("Moved to pending.");
    setExpandedId(null);
    onRowsChanged?.();
  };

  const renderDetailActions = (row: DemoManagerPaymentLedgerRow) => (
    <PortalTableDetailActions>
      {row.statusLabel !== "Paid" && row.balanceDue !== "$0.00" ? (
        <>
          <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN_PRIMARY} onClick={() => recordPaid(row, "Marked as paid.")}>
            Mark as paid
          </Button>
        </>
      ) : null}
      <Button
        type="button"
        variant="outline"
        className={PORTAL_DETAIL_BTN}
        disabled={sendingReminderId === row.id}
        onClick={() => openReminderPreview(row)}
      >
        {sendingReminderId === row.id ? "Sending…" : "Send reminder"}
      </Button>
      {row.householdChargeId ? (
        <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => onOpenReminderSettings?.()}>
          Auto reminders
        </Button>
      ) : null}
      {activeBucket !== "pending" ? (
        <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => moveToPending(row)}>
          Move to pending
        </Button>
      ) : null}
      {row.householdChargeId && row.statusLabel !== "Paid" ? (
        editingAmountId === row.id ? (
          <span className="flex items-center gap-1.5">
            <span className="text-xs text-muted">$</span>
            <Input
              className="h-7 w-24 rounded-lg px-2 py-1 text-xs"
              inputMode="decimal"
              value={editAmountDraft}
              onChange={(e) => setEditAmountDraft(e.target.value)}
              autoFocus
            />
            <Button
              type="button"
              variant="outline"
              className={PORTAL_DETAIL_BTN_PRIMARY}
              onClick={() => {
                const amt = parseFloat(editAmountDraft.replace(/[^\d.]/g, ""));
                if (!Number.isFinite(amt) || amt < 0) {
                  showToast("Enter a valid amount.");
                  return;
                }
                if (updateHouseholdChargeAmount(row.householdChargeId!, amt, managerUserId)) {
                  showToast("Amount updated.");
                  onRowsChanged?.();
                }
                setEditingAmountId(null);
              }}
            >
              Save
            </Button>
            <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => setEditingAmountId(null)}>
              Cancel
            </Button>
          </span>
        ) : (
          <Button
            type="button"
            variant="outline"
            className={PORTAL_DETAIL_BTN}
            onClick={() => {
              setEditAmountDraft(row.balanceDue.replace(/[^\d.]/g, ""));
              setEditingAmountId(row.id);
            }}
          >
            Edit amount
          </Button>
        )
      ) : null}
      <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => removePayment(row)}>
        Delete
      </Button>
    </PortalTableDetailActions>
  );

  return (
    <>
    {reminderPreview && (
      <PortalNotificationPreviewModal
        open
        title="Send payment reminder"
        onClose={() => setReminderPreview(null)}
        recipient={reminderPreview.row.residentEmail ?? ""}
        subject={reminderPreview.subject}
        body={reminderPreview.body}
        confirmLabel="Send"
        confirmLabelWithoutMessage="Close without sending"
        confirmBusy={!!sendingReminderId}
        confirmBusyLabel="Sending…"
        onConfirm={(skipMessage) => void doSendReminder(skipMessage)}
      />
    )}
    <div className="space-y-2 lg:hidden">
      {rows.map((row) => {
        const reminders = row.householdChargeId
          ? manageableRemindersForCharge(scheduledMessages, row.householdChargeId).filter((m) => m.status !== "cancelled")
          : [];
        const expanded = expandedId === row.id;
        const propertyShort = stripPropertyRoomCountSuffix(row.propertyName || "");
        return (
          <div key={row.id} className={PORTAL_MOBILE_CARD_CLASS}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => setExpandedId((cur) => (cur === row.id ? null : row.id))}
                >
                  <p className="truncate font-semibold text-foreground">{row.residentName}</p>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {row.chargeTitle}
                    {row.roomNumber ? ` · Room ${row.roomNumber}` : ""}
                  </p>
                  {propertyShort ? <p className="mt-0.5 truncate text-[11px] text-muted/90">{propertyShort}</p> : null}
                  <p className="mt-0.5 text-xs text-muted">Due {row.dueDate}</p>
                </button>
                {reminders.length ? (
                  <button
                    type="button"
                    className="mt-1 text-[11px] font-semibold text-primary"
                    onClick={() => setChargeRemindersRow(row)}
                  >
                    Auto · {reminders.length}
                  </button>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-base font-bold tabular-nums text-foreground">{row.balanceDue}</p>
                <span
                  className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusTone(row.statusLabel)}`}
                >
                  {row.statusLabel}
                </span>
              </div>
            </div>
            {expanded ? (
              <div className="mt-3 border-t border-border pt-3">
                {renderDetailActions(row)}
              </div>
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
              <th className={`${MANAGER_TABLE_TH} text-left`}>Property</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Room</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Resident</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Charge</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Amount paid</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Amount owed</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Due date</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Fragment key={row.id}>
                <tr
                  className={PORTAL_TABLE_TR_EXPANDABLE}
                  onClick={createPortalRowExpandClick(() =>
                    setExpandedId((cur) => (cur === row.id ? null : row.id)),
                  )}
                  aria-expanded={expandedId === row.id}
                >
                  <td className={`${PORTAL_TABLE_TD} font-medium text-foreground`}>{row.propertyName}</td>
                  <td className={PORTAL_TABLE_TD}>Room {row.roomNumber}</td>
                  <td className={PORTAL_TABLE_TD}>{row.residentName}</td>
                  <td className={PORTAL_TABLE_TD}>{row.chargeTitle}</td>
                  <td className={`${PORTAL_TABLE_TD} tabular-nums text-muted`}>{row.amountPaid}</td>
                  <td className={`${PORTAL_TABLE_TD} tabular-nums font-semibold text-foreground`}>{row.balanceDue}</td>
                  <td className={`${PORTAL_TABLE_TD} text-muted`}>
                    <div>{row.dueDate}</div>
                    {row.householdChargeId ? (() => {
                      const reminders = manageableRemindersForCharge(scheduledMessages, row.householdChargeId).filter(
                        (m) => m.status !== "cancelled",
                      );
                      if (!reminders.length) return null;
                      return (
                        <button
                          type="button"
                          className="mt-1 text-[11px] font-semibold text-primary hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            setChargeRemindersRow(row);
                          }}
                        >
                          Auto · {reminders.length}
                        </button>
                      );
                    })() : null}
                  </td>
                </tr>
                {expandedId === row.id ? (
                  <tr className={PORTAL_TABLE_DETAIL_ROW}>
                    <td colSpan={7} className={PORTAL_TABLE_DETAIL_CELL}>
                      {renderDetailActions(row)}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
    </>
  );
}
