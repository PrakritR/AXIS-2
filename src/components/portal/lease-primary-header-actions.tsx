"use client";

import { Button } from "@/components/ui/button";
import { PortalSectionActionRow } from "@/components/portal/portal-section-action-row";
import { RESIDENT_DETAIL_HEADER_ACTION_BTN } from "@/components/portal/portal-metrics";
import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";
import { residentHasSignedLease } from "@/lib/lease-pipeline-storage";

type LeasePrimaryHeaderActionsProps = {
  row: LeasePipelineRow;
  btnClass?: string;
  downloadLabel?: string;
  deleteLabel?: string;
  onDownload: () => void;
  onSignManager?: () => void;
  onSigningReminder?: () => void;
  signingReminderBusy?: boolean;
  onDelete?: () => void;
  onSendToResident?: () => void;
  sendToResidentBusy?: boolean;
  sendToResidentDisabled?: boolean;
  onMoveToManagerReview?: () => void;
  downloadDataAttr?: string;
  signManagerDataAttr?: string;
  signingReminderDataAttr?: string;
  deleteDataAttr?: string;
  sendToResidentDataAttr?: string;
  moveToManagerReviewDataAttr?: string;
  /** Render buttons only — parent supplies PortalSectionActionRow / footer shell. */
  embedded?: boolean;
};

/** Download, sign, send — Appendix C3 aligned action row for lease detail surfaces. */
export function LeasePrimaryHeaderActions({
  row,
  btnClass = RESIDENT_DETAIL_HEADER_ACTION_BTN,
  downloadLabel = "Download",
  deleteLabel = "Delete",
  onDownload,
  onSignManager,
  onSigningReminder,
  signingReminderBusy = false,
  onDelete,
  onSendToResident,
  sendToResidentBusy = false,
  sendToResidentDisabled = false,
  onMoveToManagerReview,
  downloadDataAttr = "lease-primary-download",
  signManagerDataAttr = "lease-primary-sign-manager",
  signingReminderDataAttr = "lease-primary-signing-reminder",
  deleteDataAttr = "lease-primary-delete",
  sendToResidentDataAttr = "lease-primary-send-resident",
  moveToManagerReviewDataAttr = "lease-primary-move-manager-review",
  embedded = false,
}: LeasePrimaryHeaderActionsProps) {
  const hasDocument = Boolean(row.generatedHtml || row.managerUploadedPdf?.dataUrl);

  const buttons = (
    <>
      {hasDocument ? (
        <Button type="button" variant="outline" className={btnClass} data-attr={downloadDataAttr} onClick={onDownload}>
          {downloadLabel}
        </Button>
      ) : null}
      {(row.status === "Manager Review" || row.status === "Draft") && onSendToResident ? (
        <Button
          type="button"
          variant="outline"
          className={btnClass}
          data-attr={sendToResidentDataAttr}
          disabled={sendToResidentBusy || sendToResidentDisabled}
          onClick={onSendToResident}
        >
          {sendToResidentBusy ? "Sending…" : "Send to resident"}
        </Button>
      ) : null}
      {row.status === "Resident Signature Pending" && onMoveToManagerReview ? (
        <Button
          type="button"
          variant="outline"
          className={btnClass}
          data-attr={moveToManagerReviewDataAttr}
          onClick={onMoveToManagerReview}
        >
          Move to review
        </Button>
      ) : null}
      {!row.managerSignature && residentHasSignedLease(row) && onSignManager ? (
        <Button
          type="button"
          variant="primary"
          className={btnClass}
          data-attr={signManagerDataAttr}
          onClick={onSignManager}
        >
          Sign
        </Button>
      ) : row.status === "Resident Signature Pending" && onSigningReminder ? (
        <Button
          type="button"
          variant="primary"
          className={btnClass}
          data-attr={signingReminderDataAttr}
          disabled={signingReminderBusy}
          title="Send signing reminder"
          onClick={onSigningReminder}
        >
          {signingReminderBusy ? "Sending…" : "Sign"}
        </Button>
      ) : null}
    </>
  );

  const leaseDelete = onDelete ? (
    <Button
      type="button"
      variant="outline"
      className={`${btnClass} border-rose-200 text-rose-800 hover:bg-[var(--status-overdue-bg)] portal-danger-outline`}
      data-attr={deleteDataAttr}
      onClick={onDelete}
    >
      {deleteLabel}
    </Button>
  ) : undefined;

  if (embedded) {
    return (
      <>
        {buttons}
        {leaseDelete}
      </>
    );
  }

  return (
    <PortalSectionActionRow variant="header">
      {buttons}
      {leaseDelete}
    </PortalSectionActionRow>
  );
}
