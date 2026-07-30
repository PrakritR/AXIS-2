"use client";

import { MoreHorizontal } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PortalSectionActionRow } from "@/components/portal/portal-section-action-row";
import { RESIDENT_DETAIL_HEADER_ACTION_BTN } from "@/components/portal/portal-metrics";
import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";
import { residentHasSignedLease } from "@/lib/lease-pipeline-storage";
import { cn } from "@/lib/utils";

const MOBILE_FOOTER_PRIMARY_BTN = cn(
  RESIDENT_DETAIL_HEADER_ACTION_BTN,
  "h-10 min-w-0 flex-1 px-2 text-sm sm:px-3",
);

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
  onGenerateLease?: () => void;
  generateLeaseBusy?: boolean;
  generateLeaseDisabled?: boolean;
  generateLeaseTitle?: string;
  onUploadPdf?: (file: File) => Promise<void>;
  uploadPdfBusy?: boolean;
  canEditDocument?: boolean;
  downloadDataAttr?: string;
  signManagerDataAttr?: string;
  signingReminderDataAttr?: string;
  deleteDataAttr?: string;
  sendToResidentDataAttr?: string;
  moveToManagerReviewDataAttr?: string;
  /** Render buttons only — parent supplies PortalSectionActionRow / footer shell. */
  embedded?: boolean;
  /** With embedded, show one flat row on all breakpoints (resident detail dock). */
  flatFooter?: boolean;
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
  onGenerateLease,
  generateLeaseBusy = false,
  generateLeaseDisabled = false,
  generateLeaseTitle,
  onUploadPdf,
  uploadPdfBusy = false,
  canEditDocument = false,
  downloadDataAttr = "lease-primary-download",
  signManagerDataAttr = "lease-primary-sign-manager",
  signingReminderDataAttr = "lease-primary-signing-reminder",
  deleteDataAttr = "lease-primary-delete",
  sendToResidentDataAttr = "lease-primary-send-resident",
  moveToManagerReviewDataAttr = "lease-primary-move-manager-review",
  embedded = false,
  flatFooter = false,
}: LeasePrimaryHeaderActionsProps) {
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const hasDocument = Boolean(row.generatedHtml || row.managerUploadedPdf?.dataUrl);

  const showSendToResident =
    (row.status === "Manager Review" || row.status === "Draft") && Boolean(onSendToResident);
  const showSign = !row.managerSignature && residentHasSignedLease(row) && Boolean(onSignManager);
  const showSigningReminder = row.status === "Resident Signature Pending" && Boolean(onSigningReminder);
  const showMoveToReview = row.status === "Resident Signature Pending" && Boolean(onMoveToManagerReview);
  const showGenerate = canEditDocument && Boolean(onGenerateLease);
  const showUpload = canEditDocument && Boolean(onUploadPdf);

  const downloadButton = hasDocument ? (
    <Button type="button" variant="outline" className={btnClass} data-attr={downloadDataAttr} onClick={onDownload}>
      {downloadLabel}
    </Button>
  ) : null;

  const sendToResidentButton = showSendToResident ? (
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
  ) : null;

  const moveToReviewButton = showMoveToReview ? (
    <Button
      type="button"
      variant="outline"
      className={btnClass}
      data-attr={moveToManagerReviewDataAttr}
      onClick={onMoveToManagerReview}
    >
      Move to review
    </Button>
  ) : null;

  const signButton = showSign ? (
    <Button
      type="button"
      variant="outline"
      className={btnClass}
      data-attr={signManagerDataAttr}
      onClick={onSignManager}
    >
      Sign
    </Button>
  ) : null;

  const signingReminderButton = showSigningReminder ? (
    <Button
      type="button"
      variant="outline"
      className={btnClass}
      data-attr={signingReminderDataAttr}
      disabled={signingReminderBusy}
      title="Send signing reminder"
      onClick={onSigningReminder}
    >
      {signingReminderBusy ? "Sending…" : "Send reminder"}
    </Button>
  ) : null;

  const generateButton = showGenerate ? (
    <Button
      type="button"
      variant="outline"
      className={btnClass}
      disabled={generateLeaseBusy || generateLeaseDisabled}
      title={generateLeaseTitle}
      onClick={onGenerateLease}
    >
      {generateLeaseBusy ? "Generating..." : "Generate lease"}
    </Button>
  ) : null;

  const uploadInput = showUpload ? (
    <input
      ref={uploadInputRef}
      type="file"
      accept="application/pdf"
      className="sr-only"
      onChange={async (e) => {
        const file = e.target.files?.[0];
        if (!file || !onUploadPdf) return;
        await onUploadPdf(file);
        e.currentTarget.value = "";
      }}
    />
  ) : null;

  const uploadControl = showUpload ? (
    <label
      className={`inline-flex cursor-pointer items-center ${btnClass} hover:bg-accent/30`}
      onClick={(event) => {
        event.preventDefault();
        uploadInputRef.current?.click();
      }}
    >
      {uploadPdfBusy ? "Uploading..." : "Upload PDF"}
    </label>
  ) : null;

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
  ) : null;

  const desktopButtons = (
    <>
      {downloadButton}
      {sendToResidentButton}
      {moveToReviewButton}
      {signButton ?? signingReminderButton}
      {generateButton}
      {uploadControl}
      {leaseDelete}
    </>
  );

  const mobileOverflowItems: ReactNode[] = [];
  if (downloadButton) {
    mobileOverflowItems.push(
      <DropdownMenuItem key="download" onClick={onDownload}>
        {downloadLabel}
      </DropdownMenuItem>,
    );
  }
  if (showGenerate) {
    mobileOverflowItems.push(
      <DropdownMenuItem
        key="generate"
        disabled={generateLeaseBusy || generateLeaseDisabled}
        onClick={onGenerateLease}
      >
        {generateLeaseBusy ? "Generating..." : "Generate lease"}
      </DropdownMenuItem>,
    );
  }
  if (showUpload) {
    mobileOverflowItems.push(
      <DropdownMenuItem
        key="upload"
        disabled={uploadPdfBusy}
        onSelect={() => uploadInputRef.current?.click()}
      >
        {uploadPdfBusy ? "Uploading..." : "Upload PDF"}
      </DropdownMenuItem>,
    );
  }
  if (showMoveToReview) {
    mobileOverflowItems.push(
      <DropdownMenuItem key="move-review" onClick={onMoveToManagerReview}>
        Move to review
      </DropdownMenuItem>,
    );
  }

  const mobileFooter = (
    <div className="flex w-full min-w-0 items-stretch gap-2">
      <div className="flex min-w-0 flex-1 gap-2">
        {showSendToResident ? (
          <Button
            type="button"
            variant="outline"
            className={MOBILE_FOOTER_PRIMARY_BTN}
            data-attr={sendToResidentDataAttr}
            disabled={sendToResidentBusy || sendToResidentDisabled}
            onClick={onSendToResident}
          >
            {sendToResidentBusy ? "Sending…" : "Send to resident"}
          </Button>
        ) : null}
        {showSign ? (
          <Button
            type="button"
            variant="outline"
            className={MOBILE_FOOTER_PRIMARY_BTN}
            data-attr={signManagerDataAttr}
            onClick={onSignManager}
          >
            Sign
          </Button>
        ) : showSigningReminder ? (
          <Button
            type="button"
            variant="outline"
            className={MOBILE_FOOTER_PRIMARY_BTN}
            data-attr={signingReminderDataAttr}
            disabled={signingReminderBusy}
            onClick={onSigningReminder}
          >
            {signingReminderBusy ? "Sending…" : "Send reminder"}
          </Button>
        ) : null}
      </div>
      {mobileOverflowItems.length > 0 || leaseDelete ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="h-10 w-10 shrink-0 px-0"
              aria-label="More lease actions"
            >
              <MoreHorizontal className="h-5 w-5" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" className="min-w-[12rem]">
            {mobileOverflowItems}
            {leaseDelete && mobileOverflowItems.length > 0 ? <DropdownMenuSeparator /> : null}
            {onDelete ? (
              <DropdownMenuItem
                className="text-rose-800 focus:text-rose-800"
                data-attr={deleteDataAttr}
                onClick={onDelete}
              >
                {deleteLabel}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );

  if (embedded) {
    if (flatFooter) {
      return (
        <>
          <div className="flex w-full min-w-0 flex-wrap items-center justify-start gap-2">
            {desktopButtons}
          </div>
          {uploadInput}
        </>
      );
    }
    return (
      <>
        <div className="hidden w-full min-w-0 md:contents">{desktopButtons}</div>
        <div className="w-full min-w-0 md:hidden">{mobileFooter}</div>
        {uploadInput}
      </>
    );
  }

  return (
    <PortalSectionActionRow variant="header">
      {desktopButtons}
    </PortalSectionActionRow>
  );
}
