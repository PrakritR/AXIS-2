"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  PortalDataTableEmpty,
  PORTAL_DETAIL_BTN,
  PortalTableDetailActions,
} from "@/components/portal/portal-data-table";
import { PortalPaymentsTable, type PortalPaymentTableRow } from "@/components/portal/portal-payments-table";
import type { DemoManagerPaymentLedgerRow, ManagerPaymentBucket } from "@/data/demo-portal";
import { deleteManagerPaymentLedgerEntry, markManagerPaymentLedgerPaid, markManagerPaymentLedgerPending } from "@/lib/demo-manager-payment-ledger";
import { deleteHouseholdCharge, markHouseholdChargePaid, markHouseholdChargePending, updateHouseholdChargeAmount } from "@/lib/household-charges";
import { Input } from "@/components/ui/input";
import { PortalNotificationPreviewModal } from "@/components/portal/portal-notification-preview-modal";
import {
  ChargeRemindersModal,
  cancelFutureRemindersForPaidCharge,
  patchScheduledMessage,
  restoreFutureRemindersForPendingCharge,
} from "@/components/portal/payment-schedule-ui";
import type { ScheduledPaymentMessage } from "@/lib/scheduled-payment-messages";
import { manageableRemindersForCharge } from "@/lib/scheduled-payment-messages";

function isMarkableAsPaid(row: DemoManagerPaymentLedgerRow): boolean {
  return row.statusLabel !== "Paid" && row.balanceDue !== "$0.00";
}

function isPaidRow(row: DemoManagerPaymentLedgerRow): boolean {
  return row.statusLabel === "Paid" || row.balanceDue === "$0.00";
}

function isRemindableRow(row: DemoManagerPaymentLedgerRow): boolean {
  return !isPaidRow(row) && Boolean(row.residentEmail?.trim());
}

function dueDateDisplayToInputValue(display: string): string {
  const stripped = display.replace(/^(by|before)\s+/i, "").trim();
  const parsed = new Date(stripped);
  if (Number.isNaN(parsed.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
}

function dueDateInputToLabel(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return "";
  const d = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
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
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editAmountDraft, setEditAmountDraft] = useState("");
  const [editDueDateDraft, setEditDueDateDraft] = useState("");
  const [sendingReminderId, setSendingReminderId] = useState<string | null>(null);
  const [reminderPreview, setReminderPreview] = useState<{ row: DemoManagerPaymentLedgerRow; subject: string; body: string } | null>(null);
  const [chargeRemindersRow, setChargeRemindersRow] = useState<DemoManagerPaymentLedgerRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIds.has(row.id)),
    [rows, selectedIds],
  );
  const singleSelectedRow = selectedRows.length === 1 ? selectedRows[0]! : null;
  const remindableSelectedRows = useMemo(
    () => selectedRows.filter(isRemindableRow),
    [selectedRows],
  );
  const showSelection = rows.length > 0;
  const allSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.id));
  const rowIdsKey = useMemo(() => rows.map((row) => row.id).join(","), [rows]);

  useEffect(() => {
    setSelectedIds(new Set());
    setEditingRowId(null);
    setEditAmountDraft("");
    setEditDueDateDraft("");
  }, [activeBucket, rowIdsKey]);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(rows.map((row) => row.id)));
  };

  const markSelectedAsPaid = async () => {
    const targets = rows.filter((row) => selectedIds.has(row.id) && isMarkableAsPaid(row));
    if (targets.length === 0) return;
    let ok = 0;
    for (const row of targets) {
      if (row.householdChargeId) {
        if (markHouseholdChargePaid(row.householdChargeId, managerUserId)) {
          await cancelFutureRemindersForPaidCharge(row.householdChargeId, scheduledMessages).catch(() => undefined);
          ok += 1;
        }
      } else {
        markManagerPaymentLedgerPaid(row.id);
        ok += 1;
      }
    }
    setSelectedIds(new Set());
    setExpandedId(null);
    onRowsChanged?.();
    onScheduleChanged?.();
    showToast(ok === 1 ? "Marked as paid." : `Marked ${ok} payments as paid.`);
  };

  const moveSelectedToPending = async () => {
    const targets = selectedRows;
    if (targets.length === 0) return;
    let ok = 0;
    for (const row of targets) {
      if (row.householdChargeId) {
        if (markHouseholdChargePending(row.householdChargeId, managerUserId)) ok += 1;
      } else {
        markManagerPaymentLedgerPending(row.id);
        ok += 1;
      }
    }
    onRowsChanged?.();
    onScheduleChanged?.();
    for (const row of targets) {
      if (!row.householdChargeId) continue;
      await restoreFutureRemindersForPendingCharge(row.householdChargeId).catch(() => undefined);
    }
    onScheduleChanged?.();
    setSelectedIds(new Set());
    setExpandedId(null);
    showToast(ok === 1 ? "Moved to pending." : `Moved ${ok} payments to pending.`);
  };

  const deleteSelected = () => {
    const targets = selectedRows;
    if (targets.length === 0) return;
    if (!window.confirm(`Delete ${targets.length} payment${targets.length === 1 ? "" : "s"}?`)) return;
    let ok = 0;
    for (const row of targets) {
      if (row.householdChargeId) {
        if (deleteHouseholdCharge(row.householdChargeId, managerUserId)) ok += 1;
      } else if (deleteManagerPaymentLedgerEntry(row.id)) {
        ok += 1;
      }
    }
    setSelectedIds(new Set());
    setExpandedId(null);
    onRowsChanged?.();
    showToast(ok === 1 ? "Payment removed." : `Removed ${ok} payments.`);
  };

  const startEdit = (row: DemoManagerPaymentLedgerRow) => {
    setEditingRowId(row.id);
    setEditAmountDraft(row.balanceDue.replace(/[^\d.]/g, ""));
    setEditDueDateDraft(dueDateDisplayToInputValue(row.dueDate));
    setExpandedId(row.id);
  };

  const cancelEdit = () => {
    setEditingRowId(null);
    setEditAmountDraft("");
    setEditDueDateDraft("");
  };

  const saveEdit = (row: DemoManagerPaymentLedgerRow) => {
    if (!row.householdChargeId) return;
    const amt = parseFloat(editAmountDraft.replace(/[^\d.]/g, ""));
    if (!Number.isFinite(amt) || amt < 0) {
      showToast("Enter a valid amount.");
      return;
    }
    const dueLabel = editDueDateDraft.trim() ? dueDateInputToLabel(editDueDateDraft) : undefined;
    if (!dueLabel && editDueDateDraft.trim()) {
      showToast("Enter a valid due date.");
      return;
    }
    if (updateHouseholdChargeAmount(row.householdChargeId, amt, managerUserId, undefined, dueLabel)) {
      showToast("Payment updated.");
      onRowsChanged?.();
      onScheduleChanged?.();
    }
    cancelEdit();
  };

  const saveBulkEditAmount = () => {
    const row = singleSelectedRow;
    if (!row) return;
    saveEdit(row);
  };

  const renderAmountOwedCell = (row: DemoManagerPaymentLedgerRow) => {
    if (editingRowId === row.id && row.householdChargeId) {
      return (
        <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <span className="text-xs text-muted">$</span>
          <Input
            className="h-8 w-24 rounded-lg px-2 py-1 text-xs tabular-nums"
            inputMode="decimal"
            value={editAmountDraft}
            onChange={(e) => setEditAmountDraft(e.target.value)}
            aria-label="Amount owed"
          />
        </span>
      );
    }
    return <span className="tabular-nums font-semibold text-foreground">{row.balanceDue}</span>;
  };

  const renderDueDateCell = (row: DemoManagerPaymentLedgerRow) => {
    if (editingRowId === row.id && row.householdChargeId) {
      return (
        <Input
          type="date"
          className="h-8 w-36 rounded-lg px-2 py-1 text-xs"
          value={editDueDateDraft}
          onChange={(e) => setEditDueDateDraft(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          aria-label="Due date"
        />
      );
    }
    return (
      <>
        <div>{row.dueDate}</div>
        {row.householdChargeId && !isPaidRow(row) ? (() => {
          const reminders = manageableRemindersForCharge(scheduledMessages, row.householdChargeId);
          const activeReminders = reminders.filter((m) => m.status !== "cancelled");
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
              Auto · {activeReminders.length > 0 ? activeReminders.length : "skipped"}
            </button>
          );
        })() : null}
      </>
    );
  };

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
    if (row.dueDate) lines.push(`Due date: ${row.dueDate}`);
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

  const sendReminderForRow = async (
    row: DemoManagerPaymentLedgerRow,
  ): Promise<{ ok: boolean; skipped?: boolean; chargePaid?: boolean }> => {
    const email = row.residentEmail?.trim();
    if (!email) return { ok: false };
    try {
      const res = await fetch("/api/portal/send-payment-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          chargeId: row.householdChargeId,
          residentEmail: email,
          residentName: row.residentName,
          chargeTitle: row.chargeTitle,
          balanceDue: row.balanceDue,
          dueDate: row.dueDate,
          propertyLabel: row.propertyName,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; skipped?: boolean; code?: string; error?: string };
      if (res.status === 409 && data.code === "charge_paid") {
        return { ok: false, chargePaid: true };
      }
      return { ok: Boolean(data.ok), skipped: data.skipped };
    } catch {
      return { ok: false };
    }
  };

  const sendBulkReminders = async () => {
    const targets = remindableSelectedRows;
    if (targets.length === 0) {
      if (selectedRows.some((row) => !isPaidRow(row))) {
        showToast("No email on file for selected resident(s).");
      }
      return;
    }
    setSendingReminderId("bulk");
    let ok = 0;
    let skipped = 0;
    for (const row of targets) {
      const result = await sendReminderForRow(row);
      if (result.chargePaid) continue;
      if (result.ok) {
        ok += 1;
        if (result.skipped) skipped += 1;
      }
    }
    setSendingReminderId(null);
    setSelectedIds(new Set());
    if (ok === 0) {
      showToast("Could not send reminder. Please try again.");
      return;
    }
    if (skipped === ok) {
      showToast(ok === 1 ? "Reminder sent to portal inbox (demo email — no real email sent)." : `Sent ${ok} reminders to portal inbox (demo email — no real email sent).`);
    } else if (skipped > 0) {
      showToast(`Sent ${ok} reminder${ok === 1 ? "" : "s"} (${skipped} via portal inbox only).`);
    } else {
      showToast(ok === 1 ? "Reminder sent to resident via email and portal inbox." : `Sent ${ok} reminders via email and portal inbox.`);
    }
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
      const result = await sendReminderForRow(row);
      if (result.chargePaid) {
        showToast("This charge is already paid — no reminder was sent.");
      } else if (result.skipped) {
        showToast("Reminder sent to portal inbox (demo email — no real email sent).");
      } else if (result.ok) {
        showToast("Reminder sent to resident via email and portal inbox.");
      } else {
        showToast("Could not send reminder. Please try again.");
      }
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

  const recordPaid = async (row: DemoManagerPaymentLedgerRow, toastMessage: string) => {
    if (row.householdChargeId) {
      if (markHouseholdChargePaid(row.householdChargeId, managerUserId)) {
        await cancelFutureRemindersForPaidCharge(row.householdChargeId, scheduledMessages).catch(() => undefined);
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

  const moveToPending = async (row: DemoManagerPaymentLedgerRow) => {
    if (row.householdChargeId) {
      if (markHouseholdChargePending(row.householdChargeId, managerUserId)) {
        onRowsChanged?.();
        onScheduleChanged?.();
        await restoreFutureRemindersForPendingCharge(row.householdChargeId).catch(() => undefined);
        onScheduleChanged?.();
        showToast("Moved to pending.");
        setExpandedId(null);
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
          <Button type="button" variant="primary" className={PORTAL_DETAIL_BTN} onClick={() => recordPaid(row, "Marked as paid.")}>
            Mark as paid
          </Button>
        </>
      ) : null}
      {!isPaidRow(row) ? (
        <>
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
            <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => setChargeRemindersRow(row)}>
              Auto reminders
            </Button>
          ) : null}
        </>
      ) : null}
      {activeBucket === "paid" ? (
        <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => moveToPending(row)}>
          Move to pending
        </Button>
      ) : null}
      {row.householdChargeId && !isPaidRow(row) ? (
        editingRowId === row.id ? (
          <>
            <Button type="button" variant="primary" className={PORTAL_DETAIL_BTN} onClick={() => saveEdit(row)}>
              Save
            </Button>
            <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={cancelEdit}>
              Cancel
            </Button>
          </>
        ) : (
          <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => startEdit(row)}>
            Edit
          </Button>
        )
      ) : null}
      <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => removePayment(row)}>
        Delete
      </Button>
    </PortalTableDetailActions>
  );

  const rowById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);

  const tableRows = useMemo<PortalPaymentTableRow[]>(
    () =>
      rows.map((row) => ({
        id: row.id,
        charge: row.chargeTitle,
        property: row.propertyName,
        payee: row.residentName,
        dueDate: row.dueDate,
        amount: row.balanceDue,
      })),
    [rows],
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
    {chargeRemindersRow?.householdChargeId ? (
      <ChargeRemindersModal
        open
        onClose={() => setChargeRemindersRow(null)}
        residentName={chargeRemindersRow.residentName}
        chargeTitle={chargeRemindersRow.chargeTitle}
        dueDate={chargeRemindersRow.dueDate}
        messages={manageableRemindersForCharge(scheduledMessages, chargeRemindersRow.householdChargeId)}
        onMessageSaved={() => onScheduleChanged?.()}
        onToggleCancel={async (message, cancelled) => {
          try {
            await patchScheduledMessage(message.id, { cancelled });
            onScheduleChanged?.();
          } catch {
            showToast("Could not update reminder.");
          }
        }}
        onOpenSettings={onOpenReminderSettings}
      />
    ) : null}
    {selectedIds.size > 0 ? (
      <div className="mb-3">
        <PortalTableDetailActions>
          {selectedRows.some(isMarkableAsPaid) ? (
            <Button
              type="button"
              variant="primary"
              className={PORTAL_DETAIL_BTN}
              data-attr="payments-mark-selected-paid"
              onClick={markSelectedAsPaid}
            >
              Mark as paid
            </Button>
          ) : null}
          {selectedRows.some((row) => !isPaidRow(row)) ? (
            <Button
              type="button"
              variant={remindableSelectedRows.length > 0 ? "primary" : "outline"}
              className={PORTAL_DETAIL_BTN}
              disabled={Boolean(sendingReminderId) || remindableSelectedRows.length === 0}
              data-attr="payments-send-reminder"
              title={
                remindableSelectedRows.length === 0
                  ? "Selected payments have no resident email on file."
                  : undefined
              }
              onClick={() => {
                if (remindableSelectedRows.length === 1) {
                  openReminderPreview(remindableSelectedRows[0]!);
                  return;
                }
                void sendBulkReminders();
              }}
            >
              {sendingReminderId ? "Sending…" : "Send reminder"}
            </Button>
          ) : null}
          {activeBucket === "paid" && selectedRows.length > 0 ? (
            <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={moveSelectedToPending}>
              Move to pending
            </Button>
          ) : null}
          {singleSelectedRow?.householdChargeId && !isPaidRow(singleSelectedRow) ? (
            editingRowId === singleSelectedRow.id ? (
              <>
                <Button type="button" variant="primary" className={PORTAL_DETAIL_BTN} onClick={saveBulkEditAmount}>
                  Save
                </Button>
                <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={cancelEdit}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                className={PORTAL_DETAIL_BTN}
                onClick={() => startEdit(singleSelectedRow)}
              >
                Edit
              </Button>
            )
          ) : null}
          <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={deleteSelected}>
            Delete
          </Button>
          <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => setSelectedIds(new Set())}>
            Clear selection
          </Button>
        </PortalTableDetailActions>
      </div>
    ) : null}
    <PortalPaymentsTable
      rows={tableRows}
      expandedId={expandedId}
      onExpand={setExpandedId}
      selection={
        showSelection
          ? {
              selectedIds,
              allSelected,
              onToggle: toggleSelected,
              onToggleAll: toggleSelectAll,
              selectLabel: (tr) => {
                const row = rowById.get(tr.id);
                return row ? `Select ${row.chargeTitle} for ${row.residentName}` : `Select ${tr.charge}`;
              },
            }
          : undefined
      }
      renderDueDateCell={(tr) => renderDueDateCell(rowById.get(tr.id)!)}
      renderAmountCell={(tr) => renderAmountOwedCell(rowById.get(tr.id)!)}
      renderExpandedActions={(tr) => renderDetailActions(rowById.get(tr.id)!)}
    />
    </>
  );
}
