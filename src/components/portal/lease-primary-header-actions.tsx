"use client";

import { Button } from "@/components/ui/button";
import { PORTAL_HEADER_ACTION_BTN } from "@/components/portal/portal-metrics";
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
  downloadDataAttr?: string;
  signManagerDataAttr?: string;
  signingReminderDataAttr?: string;
  deleteDataAttr?: string;
};

/** Download, Sign, and Delete lease — aligned top-right on resident LEASE and leases table rows. */
export function LeasePrimaryHeaderActions({
  row,
  btnClass = PORTAL_HEADER_ACTION_BTN,
  downloadLabel = "Download",
  deleteLabel = "Delete lease",
  onDownload,
  onSignManager,
  onSigningReminder,
  signingReminderBusy = false,
  onDelete,
  downloadDataAttr = "lease-primary-download",
  signManagerDataAttr = "lease-primary-sign-manager",
  signingReminderDataAttr = "lease-primary-signing-reminder",
  deleteDataAttr = "lease-primary-delete",
}: LeasePrimaryHeaderActionsProps) {
  const hasDocument = Boolean(row.generatedHtml || row.managerUploadedPdf?.dataUrl);

  return (
    <div className="flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2">
      {hasDocument ? (
        <Button type="button" variant="outline" className={btnClass} data-attr={downloadDataAttr} onClick={onDownload}>
          {downloadLabel}
        </Button>
      ) : null}
      {!row.managerSignature && residentHasSignedLease(row) && onSignManager ? (
        <Button
          type="button"
          variant="outline"
          className={btnClass}
          data-attr={signManagerDataAttr}
          onClick={onSignManager}
        >
          Sign
        </Button>
      ) : row.status === "Resident Signature Pending" && onSigningReminder ? (
        <Button
          type="button"
          variant="outline"
          className={btnClass}
          data-attr={signingReminderDataAttr}
          disabled={signingReminderBusy}
          title="Send signing reminder"
          onClick={onSigningReminder}
        >
          {signingReminderBusy ? "Sending…" : "Sign"}
        </Button>
      ) : null}
      {onDelete ? (
        <Button
          type="button"
          variant="outline"
          className={`${btnClass} border-rose-200 text-rose-800 hover:bg-[var(--status-overdue-bg)] portal-danger-outline`}
          data-attr={deleteDataAttr}
          onClick={onDelete}
        >
          {deleteLabel}
        </Button>
      ) : null}
    </div>
  );
}
