"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { BulkActionBar } from "@/components/ui/bulk-action-bar";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  PortalDataTableEmpty,
  PORTAL_DETAIL_BTN,
  PortalTableDetailActions,
} from "@/components/portal/portal-data-table";

import { PortalRecordDetailPage } from "@/components/portal/portal-record-detail-page";
import { PortalPersonRecordRow } from "@/components/portal/portal-record-row";
import { INBOX_LIST_SCROLL } from "@/components/portal/portal-inbox-ui";
import type { DemoManagerPaymentLedgerRow, ManagerPaymentBucket, ManagerPaymentDirection } from "@/data/demo-portal";
import { paymentDetailHref, paymentListHref } from "@/lib/portal-detail-routes";
import { RESIDENT_DETAIL_HEADER_ACTION_BTN } from "@/components/portal/portal-metrics";
import { usePortalNavigate } from "@/lib/portal-nav-client";
import { deleteManagerPaymentLedgerEntry, markManagerPaymentLedgerPaid, markManagerPaymentLedgerPending } from "@/lib/demo-manager-payment-ledger";
import { deleteHouseholdCharge, markHouseholdChargePaid, markHouseholdChargePending, updateHouseholdChargeAmount } from "@/lib/household-charges";
import { Input } from "@/components/ui/input";
import {
  PortalBulkPaymentReminderPreviewModal,
  PortalNotificationPreviewModal,
  type BulkPaymentReminderPreviewItem,
} from "@/components/portal/portal-notification-preview-modal";
import {
  ChargeRemindersModal,
  cancelFutureRemindersForPaidCharge,
  patchScheduledMessage,
  restoreFutureRemindersForPendingCharge,
  summarizeChargeReminders,
} from "@/components/portal/payment-schedule-ui";
import type { ScheduledPaymentMessage } from "@/lib/scheduled-payment-messages";
import { manageableRemindersForCharge } from "@/lib/scheduled-payment-messages";
import { paymentReminderRecipientLabel } from "@/lib/payment-reminder-ui";
import { buildManualPaymentInstructionLines, buildPaymentReminderBody } from "@/lib/manual-payment-instructions";

/** Compact outline buttons for the fixed bulk-selection bar (single row on mobile). */
const PAYMENTS_BULK_BAR_BTN =
  "h-8 min-h-0 shrink-0 whitespace-nowrap rounded-full border-border px-2.5 text-[10px] font-semibold sm:px-3 sm:text-[11px] !shadow-none hover:!translate-y-0 [html[data-theme=dark]_&]:portal-outline-control";

function isMarkableAsPaid(row: DemoManagerPaymentLedgerRow): boolean {
  return row.statusLabel !== "Paid" && row.balanceDue !== "$0.00";
}

function isPaidRow(row: DemoManagerPaymentLedgerRow): boolean {
  return row.statusLabel === "Paid" || row.balanceDue === "$0.00";
}

function isRemindableRow(row: DemoManagerPaymentLedgerRow): boolean {
  return !isPaidRow(row) && Boolean(row.householdChargeId || row.id);
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
  reminderScheduleSummary,
  onOpenReminderSettings,
  onRowsChanged,
  onScheduleChanged,
  paymentId: paymentIdProp,
  listBasePath,
  direction = "incoming",
  embeddedInResident = false,
  buildPaymentDetailHref,
  onEmbeddedDetailActions,
}: {
  rows: DemoManagerPaymentLedgerRow[];
  managerUserId: string | null;
  activeBucket: ManagerPaymentBucket;
  scheduledMessages?: ScheduledPaymentMessage[];
  reminderScheduleSummary?: string;
  onOpenReminderSettings?: () => void;
  onRowsChanged?: () => void;
  onScheduleChanged?: () => void;
  paymentId?: string;
  listBasePath?: string;
  direction?: ManagerPaymentDirection;
  /** When true, detail stays inside a parent shell (resident profile) instead of a full-page header. */
  embeddedInResident?: boolean;
  buildPaymentDetailHref?: (row: DemoManagerPaymentLedgerRow) => string;
  onEmbeddedDetailActions?: (actions: ReactNode | null) => void;
}) {
  const { showToast } = useAppUi();
  const navigate = usePortalNavigate();
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editAmountDraft, setEditAmountDraft] = useState("");
  const [editDueDateDraft, setEditDueDateDraft] = useState("");
  const [sendingReminderId, setSendingReminderId] = useState<string | null>(null);
  const [reminderPreview, setReminderPreview] = useState<{ row: DemoManagerPaymentLedgerRow; subject: string; body: string } | null>(null);
  const [bulkReminderPreview, setBulkReminderPreview] = useState<BulkPaymentReminderPreviewItem[] | null>(null);
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
  const detailRow = useMemo(() => {
    if (!paymentIdProp) return null;
    const decoded = decodeURIComponent(paymentIdProp);
    return rows.find((row) => row.id === decoded) ?? null;
  }, [paymentIdProp, rows]);

  const navigateToList = useCallback(() => {
    if (listBasePath) navigate(paymentListHref(listBasePath, direction, activeBucket));
  }, [activeBucket, direction, listBasePath, navigate]);

  const openPaymentDetail = useCallback(
    (row: DemoManagerPaymentLedgerRow) => {
      if (buildPaymentDetailHref) {
        navigate(buildPaymentDetailHref(row));
        return;
      }
      if (listBasePath) navigate(paymentDetailHref(listBasePath, direction, activeBucket, row.id));
    },
    [activeBucket, buildPaymentDetailHref, direction, listBasePath, navigate],
  );

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
    onRowsChanged?.();
    showToast(ok === 1 ? "Payment removed." : `Removed ${ok} payments.`);
  };

  const startEdit = (row: DemoManagerPaymentLedgerRow) => {
    setEditingRowId(row.id);
    setEditAmountDraft(row.balanceDue.replace(/[^\d.]/g, ""));
    setEditDueDateDraft(dueDateDisplayToInputValue(row.dueDate));
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
    // Show the charge's FACE amount (what the charge is for), not the outstanding
    // balance — a paid charge's balance is $0.00, which made every Paid row read
    // "$0.00". Paid vs owed is conveyed by the status badge / bucket.
    return <span className="tabular-nums font-semibold text-foreground">{row.lineAmount}</span>;
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
        <span className="block">{row.dueDate}</span>
        {row.householdChargeId && !isPaidRow(row) ? (() => {
          const reminders = manageableRemindersForCharge(scheduledMessages, row.householdChargeId);
          if (!reminders.length) return null;
          return (
            <span
              role="button"
              tabIndex={0}
              className="mt-1 inline-block cursor-pointer text-[11px] font-semibold text-primary hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                setChargeRemindersRow(row);
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                e.stopPropagation();
                setChargeRemindersRow(row);
              }}
            >
              {summarizeChargeReminders(reminders)}
            </span>
          );
        })() : null}
      </>
    );
  };

  const buildReminderPreviewForRow = (row: DemoManagerPaymentLedgerRow): BulkPaymentReminderPreviewItem | null => {
    const chargeId = row.householdChargeId?.trim() || row.id?.trim();
    if (!chargeId) return null;
    const residentName = row.residentName || "Resident";
    const chargeTitle = row.chargeTitle || "outstanding charge";
    const subject = `Payment reminder: ${chargeTitle}`;
    const manualLines = buildManualPaymentInstructionLines({
      id: row.householdChargeId ?? row.id,
      paymentReference: row.paymentReference,
      zelleContactSnapshot: row.zelleContactSnapshot,
      venmoContactSnapshot: row.venmoContactSnapshot,
      balanceLabel: row.balanceDue,
      amountLabel: row.lineAmount,
    });
    const body = buildPaymentReminderBody({
      residentName,
      residentEmail: row.residentEmail?.trim(),
      chargeTitle,
      balanceDue: row.balanceDue,
      dueDate: row.dueDate,
      propertyLabel: row.propertyName,
      managerName: "Your property manager",
      manualPaymentLines: manualLines.length ? manualLines : undefined,
    });
    const chargeLabel = [chargeTitle, row.propertyName].filter(Boolean).join(" · ");
    return {
      id: row.id,
      recipient: paymentReminderRecipientLabel(row),
      chargeLabel,
      subject,
      body,
    };
  };

  const openReminderPreview = (row: DemoManagerPaymentLedgerRow) => {
    const preview = buildReminderPreviewForRow(row);
    if (!preview) {
      showToast("This payment is missing a charge id. Sync payments and try again.");
      return;
    }
    setReminderPreview({ row, subject: preview.subject, body: preview.body });
  };

  const openBulkReminderPreview = () => {
    const targets = remindableSelectedRows;
    if (targets.length === 0) {
      showToast("Select unpaid charges to remind.");
      return;
    }
    const items: BulkPaymentReminderPreviewItem[] = [];
    for (const row of targets) {
      const preview = buildReminderPreviewForRow(row);
      if (preview) items.push(preview);
    }
    if (items.length === 0) {
      showToast("Selected payments are missing charge ids. Sync payments and try again.");
      return;
    }
    setBulkReminderPreview(items);
  };

  const sendReminderForRow = async (
    row: DemoManagerPaymentLedgerRow,
    channels?: { viaEmail?: boolean; viaSms?: boolean },
    draft?: { subject?: string; body?: string },
  ): Promise<{ ok: boolean; skipped?: boolean; chargePaid?: boolean; error?: string; emailSent?: boolean; smsSent?: boolean }> => {
    const chargeId = row.householdChargeId?.trim() || row.id?.trim();
    if (!chargeId) return { ok: false, error: "Missing charge id." };
    try {
      const res = await fetch("/api/portal/send-payment-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({
          chargeId,
          viaEmail: channels?.viaEmail !== false,
          viaSms: channels?.viaSms === true,
          subject: draft?.subject?.trim() || undefined,
          text: draft?.body?.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        skipped?: boolean;
        code?: string;
        error?: string;
        emailSent?: boolean;
        smsSent?: boolean;
      };
      if (res.status === 409 && data.code === "charge_paid") {
        return { ok: false, chargePaid: true };
      }
      return {
        ok: Boolean(data.ok),
        skipped: data.skipped,
        error: data.error,
        emailSent: data.emailSent,
        smsSent: data.smsSent,
      };
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      return { ok: false, error: timedOut ? "Reminder request timed out." : "Network error." };
    }
  };

  const sendBulkReminders = async (targets = remindableSelectedRows) => {
    if (targets.length === 0) {
      showToast("Select unpaid charges to remind.");
      return;
    }
    setSendingReminderId("bulk");
    let ok = 0;
    let skipped = 0;
    let failed = 0;
    let lastError = "";
    try {
      for (const row of targets) {
        // Bulk sends inbox + email only — SMS requires per-charge preview and channel pick.
        const result = await sendReminderForRow(row, { viaEmail: true, viaSms: false });
        if (result.chargePaid) continue;
        if (result.ok) {
          ok += 1;
          if (result.skipped) skipped += 1;
        } else {
          failed += 1;
          if (result.error) lastError = result.error;
        }
      }
    } finally {
      setSendingReminderId(null);
    }
    setSelectedIds(new Set());
    if (ok === 0) {
      showToast(lastError || "Could not send reminder. Please try again.");
      return;
    }
    if (failed > 0) {
      showToast(
        `Sent ${ok} reminder${ok === 1 ? "" : "s"}; ${failed} could not be sent${lastError ? `: ${lastError}` : "."}`,
      );
      return;
    }
    if (skipped === ok) {
      showToast(ok === 1 ? "Reminder saved to PropLane inbox." : `Sent ${ok} reminders to PropLane inbox.`);
    } else if (skipped > 0) {
      showToast(`Sent ${ok} reminder${ok === 1 ? "" : "s"} (${skipped} inbox-only).`);
    } else {
      showToast(ok === 1 ? "Reminder sent." : `Sent ${ok} reminders.`);
    }
  };

  const doSendReminder = async (
    skipMessage: boolean,
    channels?: { viaEmail?: boolean; viaSms?: boolean },
    draft?: { subject: string; body: string },
  ) => {
    if (!reminderPreview) return;
    if (skipMessage) {
      setReminderPreview(null);
      return;
    }
    const { row } = reminderPreview;
    setReminderPreview(null);
    setSendingReminderId(row.id);
    try {
      const result = await sendReminderForRow(row, channels, draft);
      if (result.chargePaid) {
        showToast("This charge is already paid. No reminder was sent.");
      } else if (result.ok) {
        const parts: string[] = ["PropLane inbox"];
        if (result.emailSent) parts.push("email");
        if (result.smsSent) parts.push("Messages");
        showToast(
          result.skipped
            ? "Reminder saved to PropLane inbox."
            : `Reminder sent via ${parts.join(" + ")}.`,
        );
      } else {
        showToast(result.error || "Could not send reminder. Please try again.");
      }
    } finally {
      setSendingReminderId(null);
    }
  };

  const hasAnySource = useMemo(() => rows.length > 0, [rows]);

  const renderPaymentDetailPanel = (row: DemoManagerPaymentLedgerRow) => (
    <div className="space-y-3 text-sm">
      <div>
        <p className="text-xs font-medium text-muted">Property</p>
        <p className="text-foreground">{row.propertyName}</p>
      </div>
      <div>
        <p className="text-xs font-medium text-muted">Charge</p>
        <p className="text-foreground">{row.chargeTitle}</p>
      </div>
      <div>
        <p className="text-xs font-medium text-muted">Due date</p>
        <div className="text-foreground">{renderDueDateCell(row)}</div>
      </div>
      <div>
        <p className="text-xs font-medium text-muted">Amount</p>
        <div className="text-foreground">{renderAmountOwedCell(row)}</div>
      </div>
    </div>
  );

  if (!hasAnySource) {
    return <PortalDataTableEmpty message="No payments in this bucket yet." icon="payment" />;
  }

  const removePayment = (row: DemoManagerPaymentLedgerRow) => {
    if (row.householdChargeId) {
      if (deleteHouseholdCharge(row.householdChargeId, managerUserId)) {
        showToast("Payment removed.");
        navigateToList();
        onRowsChanged?.();
        return;
      }
      showToast("Could not remove this line.");
      return;
    }
    if (deleteManagerPaymentLedgerEntry(row.id)) {
      showToast("Payment removed.");
      navigateToList();
      onRowsChanged?.();
      return;
    }
    showToast("Could not remove this line.");
  };


  const doSendBulkReminders = async () => {
    if (!bulkReminderPreview?.length) return;
    const targetIds = new Set(bulkReminderPreview.map((item) => item.id));
    const targets = remindableSelectedRows.filter((row) => targetIds.has(row.id));
    setBulkReminderPreview(null);
    await sendBulkReminders(targets);
  };

  const recordPaid = async (row: DemoManagerPaymentLedgerRow, toastMessage: string) => {
    if (row.householdChargeId) {
      if (markHouseholdChargePaid(row.householdChargeId, managerUserId)) {
        await cancelFutureRemindersForPaidCharge(row.householdChargeId, scheduledMessages).catch(() => undefined);
        showToast(toastMessage);
        navigateToList();
        onRowsChanged?.();
        onScheduleChanged?.();
        return;
      }
      showToast("Could not update this line.");
      return;
    }
    markManagerPaymentLedgerPaid(row.id);
    showToast(toastMessage);
    navigateToList();
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
        navigateToList();
        return;
      }
      showToast("Could not update this line.");
      return;
    }
    markManagerPaymentLedgerPending(row.id);
    showToast("Moved to pending.");
    navigateToList();
    onRowsChanged?.();
  };

  const detailActionBtnClass = embeddedInResident ? RESIDENT_DETAIL_HEADER_ACTION_BTN : PORTAL_DETAIL_BTN;

  const renderDetailActions = (row: DemoManagerPaymentLedgerRow) => (
    embeddedInResident ? (
      <>
      {row.statusLabel !== "Paid" && row.balanceDue !== "$0.00" ? (
        <Button type="button" variant="primary" className={detailActionBtnClass} onClick={() => recordPaid(row, "Marked as paid.")}>
          Mark as paid
        </Button>
      ) : null}
      {!isPaidRow(row) ? (
        <>
          <Button
            type="button"
            variant="outline"
            className={detailActionBtnClass}
            disabled={sendingReminderId === row.id}
            onClick={() => openReminderPreview(row)}
          >
            {sendingReminderId === row.id ? "Sending…" : "Send reminder"}
          </Button>
          {row.householdChargeId ? (
            <Button type="button" variant="outline" className={detailActionBtnClass} onClick={() => setChargeRemindersRow(row)}>
              Edit reminder
            </Button>
          ) : null}
        </>
      ) : null}
      {activeBucket === "paid" ? (
        <Button type="button" variant="outline" className={detailActionBtnClass} onClick={() => moveToPending(row)}>
          Move to pending
        </Button>
      ) : null}
      {row.householdChargeId && !isPaidRow(row) ? (
        editingRowId === row.id ? (
          <>
            <Button type="button" variant="primary" className={detailActionBtnClass} onClick={() => saveEdit(row)}>
              Save
            </Button>
            <Button type="button" variant="outline" className={detailActionBtnClass} onClick={cancelEdit}>
              Cancel
            </Button>
          </>
        ) : (
          <Button type="button" variant="outline" className={detailActionBtnClass} onClick={() => startEdit(row)}>
            Edit
          </Button>
        )
      ) : null}
      <Button
        type="button"
        variant="outline"
        className={`${detailActionBtnClass} border-rose-200 text-rose-800 hover:bg-[var(--status-overdue-bg)] portal-danger-outline`}
        onClick={() => removePayment(row)}
      >
        Delete
      </Button>
      </>
    ) : (
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
              Edit reminder
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
    )
  );

  useEffect(() => {
    if (!embeddedInResident || !onEmbeddedDetailActions) return;
    if (!paymentIdProp || !detailRow) {
      onEmbeddedDetailActions(null);
      return;
    }
    onEmbeddedDetailActions(renderDetailActions(detailRow));
  }, [
    embeddedInResident,
    onEmbeddedDetailActions,
    paymentIdProp,
    detailRow,
    editingRowId,
    sendingReminderId,
    activeBucket,
  ]);

  return (
    <>
    {reminderPreview && (
      <PortalNotificationPreviewModal
        open
        title="Send payment reminder"
        onClose={() => setReminderPreview(null)}
        recipient={paymentReminderRecipientLabel(reminderPreview.row)}
        subject={reminderPreview.subject}
        body={reminderPreview.body}
        showSkipMessage={false}
        showChannelPicker
        emailAvailable={Boolean(reminderPreview.row.residentEmail?.includes("@"))}
        smsAvailable
        defaultViaEmail={Boolean(reminderPreview.row.residentEmail?.includes("@"))}
        defaultViaSms={false}
        confirmLabel="Send reminder"
        confirmBusy={sendingReminderId === reminderPreview.row.id}
        confirmBusyLabel="Sending…"
        onConfirm={(skipMessage, channels, draft) => void doSendReminder(skipMessage, channels, draft)}
      />
    )}
    {bulkReminderPreview && bulkReminderPreview.length > 0 ? (
      <PortalBulkPaymentReminderPreviewModal
        open
        items={bulkReminderPreview}
        onClose={() => setBulkReminderPreview(null)}
        confirmBusy={sendingReminderId === "bulk"}
        onConfirm={() => void doSendBulkReminders()}
      />
    ) : null}
    {chargeRemindersRow?.householdChargeId ? (
      <ChargeRemindersModal
        open
        onClose={() => setChargeRemindersRow(null)}
        residentName={chargeRemindersRow.residentName}
        chargeTitle={chargeRemindersRow.chargeTitle}
        dueDate={chargeRemindersRow.dueDate}
        messages={manageableRemindersForCharge(scheduledMessages, chargeRemindersRow.householdChargeId)}
        scheduleSummary={reminderScheduleSummary}
        onMessageSaved={() => onScheduleChanged?.()}
        onToggleCancel={async (message, cancelled) => {
          await patchScheduledMessage(message.id, { cancelled });
          onScheduleChanged?.();
        }}
        onOpenSettings={onOpenReminderSettings}
      />
    ) : null}
    {selectedIds.size > 0 ? (
      <BulkActionBar count={selectedIds.size}>
        {selectedRows.some(isMarkableAsPaid) ? (
          <Button
            type="button"
            variant="outline"
            className={PAYMENTS_BULK_BAR_BTN}
            data-attr="payments-mark-selected-paid"
            onClick={markSelectedAsPaid}
          >
            Mark as paid
          </Button>
        ) : null}
        {selectedRows.some((row) => !isPaidRow(row)) ? (
          <Button
            type="button"
            variant="outline"
            className={PAYMENTS_BULK_BAR_BTN}
            disabled={Boolean(sendingReminderId) || remindableSelectedRows.length === 0}
            data-attr="payments-send-reminder"
            title={
              remindableSelectedRows.length === 0
                ? "Select at least one unpaid charge."
                : undefined
            }
            onClick={() => {
              if (remindableSelectedRows.length === 1) {
                openReminderPreview(remindableSelectedRows[0]!);
                return;
              }
              openBulkReminderPreview();
            }}
          >
            {sendingReminderId ? "Sending…" : "Send reminder"}
          </Button>
        ) : null}
        {activeBucket === "paid" && selectedRows.length > 0 ? (
          <Button type="button" variant="outline" className={PAYMENTS_BULK_BAR_BTN} onClick={moveSelectedToPending}>
            Move to pending
          </Button>
        ) : null}
        {singleSelectedRow?.householdChargeId && !isPaidRow(singleSelectedRow) ? (
          editingRowId === singleSelectedRow.id ? (
            <>
              <Button type="button" variant="outline" className={PAYMENTS_BULK_BAR_BTN} onClick={saveBulkEditAmount}>
                Save
              </Button>
              <Button type="button" variant="outline" className={PAYMENTS_BULK_BAR_BTN} onClick={cancelEdit}>
                Cancel
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              className={PAYMENTS_BULK_BAR_BTN}
              onClick={() => startEdit(singleSelectedRow)}
            >
              Edit
            </Button>
          )
        ) : null}
        <Button type="button" variant="outline" className={PAYMENTS_BULK_BAR_BTN} onClick={deleteSelected}>
          Delete
        </Button>
      </BulkActionBar>
    ) : null}
    {paymentIdProp && detailRow ? (
      embeddedInResident ? (
        <div className="space-y-3">
          <button
            type="button"
            className="text-sm font-medium text-primary hover:underline"
            data-attr="resident-payment-detail-back"
            onClick={navigateToList}
          >
            Back to payments
          </button>
          {renderPaymentDetailPanel(detailRow)}
        </div>
      ) : (
      <PortalRecordDetailPage
        pageTitle="Payments"
        title={detailRow.residentName}
        subtitle={detailRow.chargeTitle}
        avatarName={detailRow.residentName}
        backHref={listBasePath ? paymentListHref(listBasePath, direction, activeBucket) : "#"}
        backLabel="Back to payments"
        dataAttrBack="payment-detail-back"
        inlineActions
        actions={renderDetailActions(detailRow)}
      >
        {renderPaymentDetailPanel(detailRow)}
      </PortalRecordDetailPage>
      )
    ) : (
      <div className={INBOX_LIST_SCROLL}>
        {showSelection ? (
          <div className="flex items-center gap-2 border-b border-border px-3 py-2 max-md:px-2.5">
            <input
              type="checkbox"
              className="size-4 shrink-0 rounded border-border"
              checked={allSelected}
              onChange={toggleSelectAll}
              aria-label="Select all payments"
            />
            <span className="text-xs text-muted">Select all</span>
          </div>
        ) : null}
        {rows.map((row) => (
          <div key={row.id} className="flex items-stretch gap-2">
            {showSelection ? (
              <div className="flex items-center pl-3 max-md:pl-2.5">
                <input
                  type="checkbox"
                  className="size-4 shrink-0 rounded border-border"
                  checked={selectedIds.has(row.id)}
                  onChange={() => toggleSelected(row.id)}
                  aria-label={`Select ${row.chargeTitle} for ${row.residentName}`}
                />
              </div>
            ) : null}
            <div className="min-w-0 flex-1">
              <PortalPersonRecordRow
                name={row.residentName}
                subtitle={
                  row.manualPaymentReportedAt && row.manualPaymentChannel
                    ? `${row.chargeTitle} · ${row.manualPaymentChannel === "zelle" ? "Zelle" : "Venmo"} reported`
                    : row.chargeTitle
                }
                preview={row.propertyName}
                meta={row.lineAmount}
                onOpen={() => openPaymentDetail(row)}
                dataAttr="payment-list-row"
              />
            </div>
          </div>
        ))}
      </div>
    )}
    </>
  );
}
