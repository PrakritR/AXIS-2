"use client";

import { Fragment, useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";
import { deliverPortalInboxMessage } from "@/lib/portal-message-delivery";
import { formatPacificDateTime } from "@/lib/pacific-time";
import {
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PortalDataTableEmpty,
  PORTAL_DETAIL_BTN,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TR_EXPANDABLE,
  PORTAL_TABLE_TD,
  PortalTableDetailActions,
  createPortalRowExpandClick,
} from "@/components/portal/portal-data-table";
import type { ManagerLeaseTab } from "@/data/demo-portal";
import { LeaseDocumentPreview } from "@/components/portal/lease-document-preview";
import { LeaseAmendMoveOutModal } from "@/components/portal/lease-amend-move-out-modal";
import { LeaseSigningModal } from "@/components/portal/lease-signing-modal";
import { PortalNotificationPreviewModal } from "@/components/portal/portal-notification-preview-modal";
import { LeaseEditRequestModal, LEASE_EDIT_REQUEST_TEMPLATE_INTRO } from "@/components/portal/lease-edit-request-modal";
import { LeaseReportIssueModal } from "@/components/portal/lease-report-issue-modal";
import { PRIMARY_AXIS_ADMIN_EMAIL, PRIMARY_AXIS_ADMIN_LABEL } from "@/data/inbox-scoped-directory";
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
  sendLeaseToAdminReview,
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
  const [editRequestRow, setEditRequestRow] = useState<LeasePipelineRow | null>(null);
  const [editRequestBusy, setEditRequestBusy] = useState(false);
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
  const [reportIssueRow, setReportIssueRow] = useState<LeasePipelineRow | null>(null);
  const [reportIssueBusy, setReportIssueBusy] = useState(false);

  const handleAmendLeaseSuccess = useCallback(async () => {
    await syncLeasePipelineFromServer(managerUserId, { force: true });
    setAmendLeaseRow(null);
  }, [managerUserId]);

  function leaseSentToResidentBody(row: LeasePipelineRow): string {
    const unit = row.unit.trim() || "your unit";
    const lines = [
      `Hi ${row.residentName || "there"},`,
      "",
      `Your lease for ${unit} is ready to review and sign in your Axis resident portal.`,
      "",
      "Sign in to Axis, open Leases in the sidebar, and complete your signature when you're ready.",
      "",
      "If you have any questions before signing, reply in your Axis inbox and we will help.",
      "",
      "Axis",
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
      `This is a reminder to review and sign your lease for ${unit} in your Axis resident portal.`,
      dateLine,
      "",
      "If you have any questions before signing, reply in your Axis inbox and we will help.",
      "",
      "Axis",
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
        showToast("Reminder sent to Axis inbox (demo email, no external email sent).");
      } else {
        showToast("Lease-signing reminder sent via email and Axis inbox.");
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

  function leaseReportIssueLabel(row: LeasePipelineRow): string {
    const unit = row.unit.trim() || "unit";
    return [row.residentName || "Resident", unit].filter(Boolean).join(" — ");
  }

  const onSubmitReportIssue = async (subject: string, message: string) => {
    const row = reportIssueRow;
    if (!row || reportIssueBusy) return;
    const recipient = row.residentEmail.trim();
    if (!recipient || !recipient.includes("@")) {
      showToast("Resident email is missing or invalid.");
      return;
    }
    setReportIssueBusy(true);
    try {
      const fullSubject = `Lease issue — ${leaseReportIssueLabel(row)}: ${subject}`;
      const body = [`Lease: ${leaseReportIssueLabel(row)}`, "", message, "", "Property Manager"].join("\n");
      const delivery = await deliverPortalInboxMessage({
        fromName: "Property Manager",
        toEmails: [recipient],
        subject: fullSubject,
        text: body,
      });
      appendLeaseThreadMessage(row.id, "manager", `${subject}\n\n${message}`, managerUserId);
      if (delivery.ok) {
        showToast(
          delivery.skipped
            ? "Message sent to resident's Axis inbox."
            : "Message sent to resident's Axis inbox and email.",
        );
        setReportIssueRow(null);
      } else {
        showToast(delivery.error ?? "Could not send message.");
      }
    } finally {
      setReportIssueBusy(false);
    }
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
      showToast("Resident must create their Axis resident account before you can send the lease.");
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
    if (!window.confirm(`Delete lease for ${row.residentName} (${row.unit})? This cannot be undone.`)) return;
    if (deleteLeasePipelineRow(row.id, managerUserId)) {
      showToast("Lease deleted.");
    } else showToast("Could not delete lease.");
  };

  const onRequestAdminEdits = (row: LeasePipelineRow) => {
    setEditRequestRow(row);
  };

  function leaseEditRequestSubject(row: LeasePipelineRow): string {
    const unit = row.unit.trim() || "unit";
    return `Lease edits requested — ${row.residentName || "Resident"} (${unit})`;
  }

  function leaseEditRequestBody(row: LeasePipelineRow, note: string): string {
    const unit = row.unit.trim() || "the unit";
    const details = note.trim() || "(No additional details provided.)";
    const lines = [
      LEASE_EDIT_REQUEST_TEMPLATE_INTRO,
      "",
      `Lease: ${row.residentName || "Resident"} — ${unit}`,
      "",
      "Issue described by the property manager:",
      details,
      "",
      "Property Manager",
    ];
    return lines.join("\n");
  }

  const onSubmitEditRequest = async (note: string) => {
    const row = editRequestRow;
    if (!row || editRequestBusy) return;
    setEditRequestBusy(true);
    try {
      const subject = leaseEditRequestSubject(row);
      const body = leaseEditRequestBody(row, note);

      // Notify admin via BOTH the Axis portal inbox and a Resend email. The
      // shared helper posts to /api/portal/send-inbox-message with
      // deliverToPortalInbox + deliverViaEmail, matching the other send-* routes.
      const delivery = await deliverPortalInboxMessage({
        fromName: "Property Manager",
        toEmails: [PRIMARY_AXIS_ADMIN_EMAIL],
        subject,
        text: body,
      });

      const result = sendLeaseToAdminReview(row.id, managerUserId);
      if (!result.ok) {
        showToast(result.error);
        return;
      }
      appendLeaseThreadMessage(row.id, "manager", body, managerUserId);

      if (delivery.ok) {
        showToast(
          delivery.skipped
            ? "Sent to Admin Review — admin inbox updated."
            : "Sent to Admin Review — admin notified by inbox and email.",
        );
      } else {
        showToast(`Sent to Admin Review, but admin notification failed: ${delivery.error ?? "unknown error"}`);
      }
      setEditRequestRow(null);
      setExpandedId(null);
    } finally {
      setEditRequestBusy(false);
    }
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

  if (bucketRows.length === 0) {
    return (
      <PortalDataTableEmpty
        icon="lease"
        message={rows.length === 0 ? "No lease drafts yet." : "No leases in this stage yet."}
      />
    );
  }

  return (
    <div className={PORTAL_DATA_TABLE_WRAP}>
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
      <LeaseEditRequestModal
        open={editRequestRow !== null}
        residentName={editRequestRow?.residentName ?? ""}
        unit={editRequestRow?.unit ?? ""}
        recipientLabel={`${PRIMARY_AXIS_ADMIN_LABEL} (${PRIMARY_AXIS_ADMIN_EMAIL})`}
        busy={editRequestBusy}
        onClose={() => {
          if (editRequestBusy) return;
          setEditRequestRow(null);
        }}
        onSubmit={onSubmitEditRequest}
      />
      <LeaseReportIssueModal
        open={reportIssueRow !== null}
        recipientLabel={reportIssueRow ? `${reportIssueRow.residentName || "the resident"}` : ""}
        leaseLabel={reportIssueRow ? leaseReportIssueLabel(reportIssueRow) : ""}
        busy={reportIssueBusy}
        onClose={() => {
          if (reportIssueBusy) return;
          setReportIssueRow(null);
        }}
        onSubmit={(subject, message) => void onSubmitReportIssue(subject, message)}
      />
      <PortalNotificationPreviewModal
        open={leaseSentPreview !== null}
        title="Send lease to resident — preview"
        onClose={() => setLeaseSentPreview(null)}
        recipient={leaseSentPreview?.recipient ?? ""}
        subject={leaseSentPreview?.subject ?? ""}
        body={leaseSentPreview?.body ?? ""}
        footerNote="The lease will be released to the resident portal after you confirm. This message is delivered to Axis inbox and email."
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
      <div className={PORTAL_DATA_TABLE_SCROLL}>
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className={PORTAL_TABLE_HEAD_ROW}>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Resident</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Unit / home</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Stage</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Updated</th>
            </tr>
          </thead>
          <tbody>
            {bucketRows.map((row) => (
              <Fragment key={row.id}>
                {/** current workflow status drives allowed actions; bucket only drives tab grouping */}
                <tr
                  className={PORTAL_TABLE_TR_EXPANDABLE}
                  onClick={createPortalRowExpandClick(() =>
                    setExpandedId((cur) => (cur === row.id ? null : row.id)),
                  )}
                  aria-expanded={expandedId === row.id}
                >
                  <td className={`${PORTAL_TABLE_TD} font-medium text-foreground`}>{row.residentName}</td>
                  <td className={PORTAL_TABLE_TD}>{row.unit}</td>
                  <td className={PORTAL_TABLE_TD}>{row.status ?? row.stageLabel}</td>
                  <td className={`${PORTAL_TABLE_TD} text-muted`}>{row.updated}</td>
                </tr>
                {expandedId === row.id ? (
                  <tr className={PORTAL_TABLE_DETAIL_ROW}>
                    <td colSpan={4} className={PORTAL_TABLE_DETAIL_CELL}>
                      {row.notes?.trim() ? (
                        <p className="text-sm leading-relaxed text-muted">{row.notes}</p>
                      ) : null}
                      <p className="mt-1.5 text-xs text-muted">Version v{row.versionNumber ?? row.pdfVersion}</p>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted">{row.status ?? row.stageLabel}</p>
                      {row.managerSignature || row.residentSignature ? (
                        <div className="mt-2 grid gap-2 rounded-xl border px-3 py-2.5 text-xs portal-banner-success sm:grid-cols-2">
                          <div>
                            <span className="font-semibold">Manager signature</span>
                            {row.managerSignature ? (
                              <p>
                                <span
                                  className="text-sm text-foreground"
                                  style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic" }}
                                >
                                  {row.managerSignature.name}
                                </span>
                                <span className="ml-2 text-emerald-700">{formatPacificDateTime(row.managerSignature.signedAtIso)}</span>
                              </p>
                            ) : (
                              <p className="text-amber-700">Pending</p>
                            )}
                          </div>
                          <div>
                            <span className="font-semibold">Resident signature</span>
                            {row.residentSignature ? (
                              <p>
                                <span
                                  className="text-sm text-foreground"
                                  style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic" }}
                                >
                                  {row.residentSignature.name}
                                </span>
                                <span className="ml-2 text-emerald-700">{formatPacificDateTime(row.residentSignature.signedAtIso)}</span>
                              </p>
                            ) : (
                              <p className="text-amber-700">Pending</p>
                            )}
                          </div>
                        </div>
                      ) : null}

                      <PortalTableDetailActions placement="top">
                        {row.status === "Admin Review" ? (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              className={PORTAL_DETAIL_BTN}
                              onClick={() => onDownload(row)}
                            >
                              Download lease
                            </Button>
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
                              Upload corrected lease
                            </Button>
                            ) : null}
                            <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => onMoveToManagerReview(row)}>
                              Send back to manager
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className={PORTAL_DETAIL_BTN}
                              onClick={() => setReportIssueRow(row)}
                            >
                              Report issue
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className={`${PORTAL_DETAIL_BTN} border-rose-200 text-rose-800 hover:bg-[var(--status-overdue-bg)]`}
                              onClick={() => onDeleteLease(row)}
                            >
                              Delete lease
                            </Button>
                          </>
                        ) : (
                          <>
                            {!hasLeaseDocument(row) && leaseAllowsManagerDocumentEdits(row) ? (
                              <Button
                                type="button"
                                variant="outline"
                                className={PORTAL_DETAIL_BTN}
                                disabled={generatingRowId === row.id || !generationGate(row).ok}
                                title={generationGateTitle(row)}
                                onClick={() => runGenerateLease(row)}
                              >
                                {generatingRowId === row.id ? "Generating..." : "Generate lease"}
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              variant="outline"
                              className={PORTAL_DETAIL_BTN}
                              onClick={() => onDownload(row)}
                            >
                              Download lease
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className={PORTAL_DETAIL_BTN}
                              onClick={() => setReportIssueRow(row)}
                            >
                              Report issue
                            </Button>
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
                                      This lease cannot be sent yet. The resident must first create their Axis resident account using their
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
                                  onClick={() => openSendLeasePreview(row)}
                                  disabled={
                                    sendingToResidentRowId === row.id ||
                                    !residentAccountEmails.has(row.residentEmail.trim().toLowerCase()) ||
                                    (!row.generatedHtml && !row.managerUploadedPdf?.dataUrl)
                                  }
                                >
                                  {sendingToResidentRowId === row.id ? "Sending…" : "Send to resident"}
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className={PORTAL_DETAIL_BTN}
                                  onClick={() => onRequestAdminEdits(row)}
                                >
                                  Send to admin
                                </Button>
                              </>
                            ) : null}
                            {row.status === "Manager Signature Pending" ? (
                              <Button
                                type="button"
                                variant="outline"
                                className={PORTAL_DETAIL_BTN}
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
                          </>
                        )}
                      </PortalTableDetailActions>

                      {row.status === "Admin Review" ? (
                        <>
                          <LeaseDocumentPreview
                            row={row}
                            emptyHint="No lease document yet — upload a corrected lease."
                          />
                          <p className="mt-3 max-w-xl text-xs leading-relaxed text-muted">
                            Admin review is paused for resident actions. Correct the single lease document here, then send it back to the manager.
                          </p>
                        </>
                      ) : (
                        <LeaseDocumentPreview row={row} />
                      )}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
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
    </div>
  );
}
