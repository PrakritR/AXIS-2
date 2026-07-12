"use client";

import { Fragment, useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";
import { deliverPortalInboxMessage } from "@/lib/portal-message-delivery";
import { PORTAL_DATA_TABLE, PortalDataTableColGroup, portalTableColumnPercents, PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PortalDataTableEmpty,
  PORTAL_DETAIL_BTN,
  PORTAL_MOBILE_CARD_CLASS,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TR_EXPANDABLE,
  PORTAL_TABLE_TD,
  PortalTableDetailActions,
  PortalTableInlineExpand,
  createPortalRowExpandClick,} from "@/components/portal/portal-data-table";
import type { ManagerLeaseTab } from "@/data/demo-portal";
import { LeaseDocumentPreview } from "@/components/portal/lease-document-preview";
import { LeaseAmendMoveOutModal } from "@/components/portal/lease-amend-move-out-modal";
import { LeaseSigningModal } from "@/components/portal/lease-signing-modal";
import { PortalNotificationPreviewModal } from "@/components/portal/portal-notification-preview-modal";
import {
  appendLeaseThreadMessage,
  deleteLeasePipelineRow,
  downloadLeaseFromRow,
  generateLeaseHtmlForRow,
  getLeaseDocumentHtml,
  leaseAllowsManagerDocumentEdits,
  leaseGenerationSupportedForRow,
  managerSignLease,
  managerUploadLeasePdf,
  printLeaseAsPdf,
  sendLeaseBackToManager,
  sendLeaseToResident,
  hasBothLeaseSignatures,
  leaseRowMatchesManagerTab,
  residentHasSignedLease,
  syncLeasePipelineFromServer,
  type LeasePipelineRow,
} from "@/lib/lease-pipeline-storage";

export function ManagerLeasesPipelinePanel({
  rows,
  tab,
  refreshKey,
  managerUserId,
  residentAccountEmails,
  onEmailAccountSetup,
}: {
  rows: LeasePipelineRow[];
  tab: ManagerLeaseTab;
  refreshKey: number;
  managerUserId?: string | null;
  residentAccountEmails: Set<string>;
  onEmailAccountSetup?: (email: string, name: string, axisId?: string) => void;
}) {
  const { showToast } = useAppUi();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [pendingRowId, setPendingRowId] = useState<string | null>(null);
  const [generatingRowId, setGeneratingRowId] = useState<string | null>(null);
  const [signingRow, setSigningRow] = useState<LeasePipelineRow | null>(null);
  const [emailBusyForRow, setEmailBusyForRow] = useState<string | null>(null);
  const [reminderBusyForRow, setReminderBusyForRow] = useState<string | null>(null);
  const [sendingToResidentRowId, setSendingToResidentRowId] = useState<string | null>(null);
  const [leaseSentPreview, setLeaseSentPreview] = useState<{
    row: LeasePipelineRow;
    recipient: string;
    subject: string;
    body: string;
  } | null>(null);
  const [leaseReminderPreview, setLeaseReminderPreview] = useState<{
    row: LeasePipelineRow;
    recipient: string;
    subject: string;
    body: string;
  } | null>(null);
  const [amendLeaseRow, setAmendLeaseRow] = useState<LeasePipelineRow | null>(null);

  const handleAmendLeaseSuccess = useCallback(async () => {
    await syncLeasePipelineFromServer(managerUserId, { force: true });
    setAmendLeaseRow(null);
  }, [managerUserId]);

  function leaseSentToResidentBody(row: LeasePipelineRow): string {
    const unit = row.unit.trim() || "your unit";
    const lines = [
      `Hi ${row.residentName || "there"},`,
      "",
      `Your lease for ${unit} is ready to review and sign in your PropLane resident portal.`,
      "",
      "Sign in to PropLane, open Leases in the sidebar, and complete your signature when you're ready.",
      "",
      "If you have any questions before signing, reply in your PropLane inbox and we will help.",
      "",
      "PropLane",
    ];
    return lines.join("\n");
  }

  async function notifyResidentLeaseReady(row: LeasePipelineRow): Promise<{ ok: boolean; skipped?: boolean }> {
    const unit = row.unit.trim() || "your unit";
    const result = await deliverPortalInboxMessage({
      fromName: "Property Manager",
      toEmails: [row.residentEmail.trim()],
      subject: `Your lease for ${unit} is ready to sign`,
      text: leaseSentToResidentBody(row),
    });
    return { ok: result.ok, skipped: result.skipped };
  }

  function leaseReminderBody(row: LeasePipelineRow): string {
    const unit = row.unit.trim() || "your unit";
    const leaseStart = row.application?.leaseStart?.trim();
    const leaseEnd = row.application?.leaseEnd?.trim();
    const dateLine = leaseStart
      ? leaseEnd
        ? `Lease dates: ${leaseStart} to ${leaseEnd}`
        : `Lease start date: ${leaseStart}`
      : "";
    const lines = [
      `Hi ${row.residentName || "there"},`,
      "",
      `This is a reminder to review and sign your lease for ${unit} in your PropLane resident portal.`,
      dateLine,
      "",
      "If you have any questions before signing, reply in your PropLane inbox and we will help.",
      "",
      "PropLane",
    ].filter(Boolean);
    return lines.join("\n");
  }

  async function sendAccountEmail(row: LeasePipelineRow) {
    if (emailBusyForRow) return;
    setEmailBusyForRow(row.id);
    try {
      const res = await fetch("/api/portal/send-resident-welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ to: row.residentEmail, residentName: row.residentName, axisId: row.axisId }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; mailtoHref?: string };
      if (res.ok && data.ok) {
        showToast("Account setup email sent.");
        onEmailAccountSetup?.(row.residentEmail, row.residentName, row.axisId);
        return;
      }
      if (typeof data.mailtoHref === "string") {
        const { openMailtoHref } = await import("@/lib/resident-welcome-email");
        openMailtoHref(data.mailtoHref);
        showToast("Email provider not configured — opened a draft in your mail app.");
        return;
      }
      showToast(data.error ?? "Could not send account setup email.");
    } catch {
      showToast("Could not send account setup email.");
    } finally {
      setEmailBusyForRow(null);
    }
  }

  async function sendLeaseSigningReminder(row: LeasePipelineRow, recipient: string, subject: string, text: string) {
    setReminderBusyForRow(row.id);
    try {
      const res = await deliverPortalInboxMessage({
        fromName: "Property Manager",
        toEmails: [recipient],
        subject,
        text,
      });

      if (!res.ok) {
        showToast(res.error ?? "Could not send lease signing reminder.");
        return;
      }

      appendLeaseThreadMessage(row.id, "manager", "Sent lease-signing reminder to resident.", managerUserId);
      if (res.skipped) {
        showToast("Reminder sent to PropLane inbox (demo email, no external email sent).");
      } else {
        showToast("Lease-signing reminder sent via email and PropLane inbox.");
      }
    } catch {
      showToast("Could not send lease signing reminder.");
    } finally {
      setReminderBusyForRow(null);
    }
  }

  function openLeaseSigningReminderPreview(row: LeasePipelineRow) {
    const recipient = row.residentEmail.trim();
    if (!recipient || !recipient.includes("@")) {
      showToast("Resident email is missing or invalid.");
      return;
    }
    setLeaseReminderPreview({
      row,
      recipient,
      subject: `Reminder: sign your lease for ${row.unit}`,
      body: leaseReminderBody(row),
    });
  }

  const generationGate = (row: LeasePipelineRow) => leaseGenerationSupportedForRow(row);
  const generationGateTitle = (row: LeasePipelineRow) => {
    const gate = generationGate(row);
    return gate.ok ? undefined : gate.error;
  };
  const hasLeaseDocument = (row: LeasePipelineRow) => Boolean(row.generatedHtml || row.managerUploadedPdf?.dataUrl);
  void refreshKey;
  const bucketRows = useMemo(() => rows.filter((r) => leaseRowMatchesManagerTab(r, tab)), [rows, tab]);

  const runGenerateLease = (row: LeasePipelineRow) => {
    if (generatingRowId) return;
    setGeneratingRowId(row.id);
    window.setTimeout(() => {
      try {
        const res = generateLeaseHtmlForRow(row.id, managerUserId);
        if (res.ok) {
          showToast(`Lease generated (v${res.version}).`);
        } else showToast(res.error ?? "Could not generate.");
      } finally {
        setGeneratingRowId(null);
      }
    }, 0);
  };

  const onDownload = (row: LeasePipelineRow) => {
    if (row.managerUploadedPdf?.dataUrl) {
      downloadLeaseFromRow(row);
      showToast("PDF download started.");
      return;
    }
    if (row.generatedHtml) {
      printLeaseAsPdf(row);
      showToast("Print dialog opened — choose 'Save as PDF' to download.");
      return;
    }
    showToast("Generate a lease or upload a PDF first.");
  };

  const openSendLeasePreview = (row: LeasePipelineRow) => {
    const residentEmail = row.residentEmail.trim().toLowerCase();
    if (!residentEmail || !residentAccountEmails.has(residentEmail)) {
      showToast("Resident must create their PropLane resident account before you can send the lease.");
      return;
    }
    if (!row.generatedHtml && !row.managerUploadedPdf?.dataUrl) {
      showToast("Generate or upload a lease document first.");
      return;
    }
    const unit = row.unit.trim() || "your unit";
    setLeaseSentPreview({
      row,
      recipient: row.residentEmail.trim(),
      subject: `Your lease for ${unit} is ready to sign`,
      body: leaseSentToResidentBody(row),
    });
  };

  const confirmSendLeaseToResident = async (skipMessage: boolean) => {
    if (!leaseSentPreview || sendingToResidentRowId) return;
    const { row } = leaseSentPreview;
    setSendingToResidentRowId(row.id);
    try {
      const result = await sendLeaseToResident(row.id, managerUserId);
      if (!result.ok) {
        showToast(result.error ?? "Could not send lease.");
        return;
      }
      setLeaseSentPreview(null);
      appendLeaseThreadMessage(row.id, "manager", "Sent lease to resident for review and signature.", managerUserId);
      if (skipMessage) {
        showToast("Lease sent to resident portal (no notification sent).");
      } else {
        const notice = await notifyResidentLeaseReady(row);
        if (notice.ok) {
          showToast(
            notice.skipped
              ? "Lease sent to resident portal (demo inbox only)."
              : "Lease sent to resident portal with inbox and email notification.",
          );
        } else {
          showToast("Lease sent to resident portal. Notification could not be delivered.");
        }
      }
    } finally {
      setSendingToResidentRowId(null);
    }
  };

  const onSendToResident = (row: LeasePipelineRow) => {
    openSendLeasePreview(row);
  };

  const onDeleteLease = (row: LeasePipelineRow) => {
    if (!window.confirm(`Delete the lease document for ${row.residentName} (${row.unit})? Generate or upload can recreate it.`)) return;
    if (deleteLeasePipelineRow(row.id, managerUserId)) {
      showToast("Lease document deleted.");
    } else showToast("Could not delete lease.");
  };

  const onMoveToManagerReview = (row: LeasePipelineRow) => {
    const result = sendLeaseBackToManager(row.id, managerUserId);
    if (!result.ok) {
      showToast(result.error);
      return;
    }
    appendLeaseThreadMessage(row.id, "manager", "Moved lease back to manager review.", managerUserId);
    showToast("Lease moved to Manager Review.");
    setExpandedId(null);
  };

  const onManagerSign = (row: LeasePipelineRow) => {
    if (!residentHasSignedLease(row)) {
      showToast("The resident must sign first before the manager can countersign.");
      return;
    }
    setSigningRow(row);
  };

  const handleManagerModalSign = async (signatureName: string) => {
    if (!signingRow) return false;
    const ok = await managerSignLease(signingRow.id, signatureName.trim(), managerUserId);
    if (ok) {
      showToast(
        hasBothLeaseSignatures({
          ...signingRow,
          managerSignature: { role: "manager", name: signatureName.trim(), signedAtIso: new Date().toISOString() },
        })
          ? "Lease fully signed."
          : "Manager signature saved.",
      );
      setExpandedId(null);
      setSigningRow(null);
      return true;
    } else {
      showToast("Could not sign lease.");
      return false;
    }
  };

  const onPickUpload = async (rowId: string, files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    setPendingRowId(rowId);
    const res = await managerUploadLeasePdf(rowId, f, managerUserId);
    setPendingRowId(null);
    if (uploadRef.current) uploadRef.current.value = "";
    if (res.ok) {
      showToast("PDF saved — resident sees this on their Lease tab.");
    } else showToast(res.error ?? "Upload failed.");
  };

  const renderLeaseRowDetail = (row: LeasePipelineRow) => (
    <>
      <PortalTableDetailActions placement="top">
            {!hasLeaseDocument(row) && leaseAllowsManagerDocumentEdits(row) ? (
              <Button
                type="button"
                variant="outline"
                className={PORTAL_DETAIL_BTN}
                data-attr="lease-generate"
                disabled={generatingRowId === row.id || !generationGate(row).ok}
                title={generationGateTitle(row)}
                onClick={() => runGenerateLease(row)}
              >
                {generatingRowId === row.id ? "Generating..." : "Generate lease"}
              </Button>
            ) : null}
            {hasLeaseDocument(row) ? (
            <Button
              type="button"
              variant="outline"
              className={PORTAL_DETAIL_BTN}
              onClick={() => onDownload(row)}
            >
              Download lease
            </Button>
            ) : null}
            {hasBothLeaseSignatures(row) && row.status === "Fully Signed" ? (
              <Button
                type="button"
                variant="outline"
                className={PORTAL_DETAIL_BTN}
                onClick={() => setAmendLeaseRow(row)}
              >
                Renew or extend lease
              </Button>
            ) : null}
            {!row.managerSignature && residentHasSignedLease(row) ? (
              <Button
                type="button"
                variant="outline"
                className={PORTAL_DETAIL_BTN}
                data-attr="lease-manager-sign"
                onClick={() => onManagerSign(row)}
                disabled={!row.generatedHtml && !row.managerUploadedPdf?.dataUrl}
              >
                Sign as manager
              </Button>
            ) : null}
            {leaseAllowsManagerDocumentEdits(row) ? (
            <Button
              type="button"
              variant="outline"
              className={PORTAL_DETAIL_BTN}
              onClick={() => {
                setPendingRowId(row.id);
                uploadRef.current?.click();
              }}
              disabled={pendingRowId === row.id}
            >
              Upload replacement
            </Button>
            ) : null}

            {row.status === "Manager Review" || row.status === "Draft" ? (
              <>
                {!residentAccountEmails.has(row.residentEmail.trim().toLowerCase()) ? (
                  <div className="flex flex-wrap items-start gap-2">
                    <p className="max-w-xl text-xs leading-relaxed text-amber-800">
                      This lease cannot be sent yet. The resident must first create their PropLane resident account using their
                      application ID and matching email.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full bg-primary/[0.06] px-3 py-1 text-xs text-primary hover:bg-primary/[0.12]"
                      disabled={emailBusyForRow === row.id}
                      onClick={() => void sendAccountEmail(row)}
                    >
                      {emailBusyForRow === row.id ? "Sending…" : "Email account setup"}
                    </Button>
                  </div>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  className={PORTAL_DETAIL_BTN}
                  data-attr="lease-send-resident"
                  onClick={() => openSendLeasePreview(row)}
                  disabled={
                    sendingToResidentRowId === row.id ||
                    !residentAccountEmails.has(row.residentEmail.trim().toLowerCase()) ||
                    (!row.generatedHtml && !row.managerUploadedPdf?.dataUrl)
                  }
                >
                  {sendingToResidentRowId === row.id ? "Sending…" : "Send to resident"}
                </Button>
              </>
            ) : null}
            {row.status === "Manager Signature Pending" ? (
              <Button
                type="button"
                variant="outline"
                className={PORTAL_DETAIL_BTN}
                data-attr="lease-manager-sign"
                onClick={() => onManagerSign(row)}
                disabled={!residentHasSignedLease(row) || (!getLeaseDocumentHtml(row) && !row.managerUploadedPdf?.dataUrl)}
              >
                Manager sign lease
              </Button>
            ) : null}
            {row.status === "Resident Signature Pending" ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className={PORTAL_DETAIL_BTN}
                  disabled={reminderBusyForRow === row.id}
                  onClick={() => openLeaseSigningReminderPreview(row)}
                >
                  {reminderBusyForRow === row.id ? "Sending…" : "Send signing reminder"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={PORTAL_DETAIL_BTN}
                  onClick={() => onMoveToManagerReview(row)}
                >
                  Move to manager review
                </Button>
              </>
            ) : null}
            {row.status !== "Fully Signed" ? (
            <Button
              type="button"
              variant="outline"
              className={`${PORTAL_DETAIL_BTN} border-rose-200 text-rose-800 hover:bg-[var(--status-overdue-bg)]`}
              onClick={() => onDeleteLease(row)}
            >
              Delete lease
            </Button>
            ) : null}
      </PortalTableDetailActions>

      <LeaseDocumentPreview row={row} />
    </>
  );

  if (bucketRows.length === 0) {
    return (
      <PortalDataTableEmpty
        icon="lease"
        message={rows.length === 0 ? "No lease drafts yet." : "No leases in this stage yet."}
      />
    );
  }

  return (
    <>
      {signingRow ? (
        <LeaseSigningModal
          row={signingRow}
          signerName=""
          signerRoleLabel="Manager / authorized agent name"
          agreementLabel="Residential Room Rental Agreement"
          onSign={handleManagerModalSign}
          onClose={() => setSigningRow(null)}
        />
      ) : null}
      <PortalNotificationPreviewModal
        open={leaseSentPreview !== null}
        title="Send lease to resident — preview"
        onClose={() => setLeaseSentPreview(null)}
        recipient={leaseSentPreview?.recipient ?? ""}
        subject={leaseSentPreview?.subject ?? ""}
        body={leaseSentPreview?.body ?? ""}
        footerNote="The lease will be released to the resident portal after you confirm. This message is delivered to PropLane inbox and email."
        confirmLabel="Send lease & notification"
        confirmLabelWithoutMessage="Send lease only"
        confirmBusy={Boolean(leaseSentPreview && sendingToResidentRowId === leaseSentPreview.row.id)}
        confirmBusyLabel="Sending…"
        onConfirm={(skipMessage) => void confirmSendLeaseToResident(skipMessage)}
      />
      <PortalNotificationPreviewModal
        open={leaseReminderPreview !== null}
        title="Lease signing reminder — preview"
        onClose={() => setLeaseReminderPreview(null)}
        recipient={leaseReminderPreview?.recipient ?? ""}
        subject={leaseReminderPreview?.subject ?? ""}
        body={leaseReminderPreview?.body ?? ""}
        confirmLabel="Send reminder"
        confirmLabelWithoutMessage="Close without sending"
        confirmBusy={Boolean(leaseReminderPreview?.row && reminderBusyForRow === leaseReminderPreview.row.id)}
        confirmBusyLabel="Sending…"
        onConfirm={(skipMessage) => {
          if (!leaseReminderPreview) return;
          if (skipMessage) {
            setLeaseReminderPreview(null);
            return;
          }
          const preview = leaseReminderPreview;
          setLeaseReminderPreview(null);
          void sendLeaseSigningReminder(preview.row, preview.recipient, preview.subject, preview.body);
        }}
      />
      <input
        ref={uploadRef}
        type="file"
        accept="application/pdf"
        className="sr-only"
        aria-hidden
        onChange={(e) => {
          const id = pendingRowId;
          if (id) void onPickUpload(id, e.target.files);
        }}
      />
      <div className="space-y-2 lg:hidden">
        {bucketRows.map((row) => (
          <div key={row.id} id={`portal-lease-${row.id}`} className={PORTAL_MOBILE_CARD_CLASS}>
            <button
              type="button"
              className="flex w-full gap-2 text-left"
              onClick={() => setExpandedId((cur) => (cur === row.id ? null : row.id))}
              aria-expanded={expandedId === row.id}
            >
              <div className="min-w-0 flex-1">
                <PortalTableInlineExpand expanded={expandedId === row.id} className="font-semibold text-foreground">
                  <span className="truncate">{row.residentName}</span>
                </PortalTableInlineExpand>
                <p className="mt-0.5 truncate text-xs text-muted">{row.unit}</p>
                <p className="mt-0.5 truncate text-[11px] text-muted/90">Updated {row.updated}</p>
              </div>
            </button>
            {expandedId === row.id ? (
              <div className="mt-3 border-t border-border pt-3">{renderLeaseRowDetail(row)}</div>
            ) : null}
          </div>
        ))}
      </div>

      <div className={`${PORTAL_DATA_TABLE_WRAP} hidden lg:block`}>
        <div className={PORTAL_DATA_TABLE_SCROLL}>
          <table className={PORTAL_DATA_TABLE}>
            <PortalDataTableColGroup percents={portalTableColumnPercents(3)} />
            <thead>
              <tr className={PORTAL_TABLE_HEAD_ROW}>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Resident</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Unit / home</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {bucketRows.map((row) => (
                <Fragment key={row.id}>
                  {/** current workflow status drives allowed actions; bucket only drives tab grouping */}
                  <tr
                    id={`portal-lease-${row.id}`}
                    className={PORTAL_TABLE_TR_EXPANDABLE}
                    onClick={createPortalRowExpandClick(() =>
                      setExpandedId((cur) => (cur === row.id ? null : row.id)),
                    )}
                    aria-expanded={expandedId === row.id}
                  >
                    <td className={`${PORTAL_TABLE_TD} font-medium text-foreground`}>
                      <PortalTableInlineExpand expanded={expandedId === row.id}>{row.residentName}</PortalTableInlineExpand>
                    </td>
                    <td className={PORTAL_TABLE_TD}>{row.unit}</td>
                    <td className={`${PORTAL_TABLE_TD} text-muted`}>{row.updated}</td>
                  </tr>
                  {expandedId === row.id ? (
                    <tr className={PORTAL_TABLE_DETAIL_ROW}>
                      <td colSpan={3} className={PORTAL_TABLE_DETAIL_CELL}>
                        {renderLeaseRowDetail(row)}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {amendLeaseRow ? (
        <LeaseAmendMoveOutModal
          open
          onClose={() => setAmendLeaseRow(null)}
          currentEnd={amendLeaseRow.application?.leaseEnd ?? ""}
          leaseStart={amendLeaseRow.application?.leaseStart ?? ""}
          checkUrl="/api/manager/amend-lease"
          amendUrl="/api/manager/amend-lease"
          amendBody={{ leaseId: amendLeaseRow.id }}
          onSuccess={() => void handleAmendLeaseSuccess()}
        />
      ) : null}
    </>
  );
}
