"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { MANAGER_TABLE_TH, RESIDENT_DETAIL_HEADER_ACTION_BTN } from "@/components/portal/portal-metrics";
import { deliverPortalInboxMessage } from "@/lib/portal-message-delivery";
import { buildLeaseReadyForResidentMessage } from "@/lib/resident-portal-login-copy";
import {
  PortalDetailHeader,
  PortalListDetailPane,
  PortalListDetailPlaceholder,
  portalUsesDesktopSplit,
} from "@/components/portal/portal-list-detail-shell";
import { PortalPersonRecordRow } from "@/components/portal/portal-record-row";
import { INBOX_LIST_SCROLL } from "@/components/portal/portal-inbox-ui";
import { leaseDetailHref, leaseListHref } from "@/lib/portal-detail-routes";
import { usePortalNavigate } from "@/lib/portal-nav-client";
import { Badge } from "@/components/ui/badge";
import {
  PortalDataTableEmpty,
  PORTAL_DETAIL_BTN,
  PortalTableDetailActions,
} from "@/components/portal/portal-data-table";
import type { ManagerLeaseTab } from "@/data/demo-portal";
import { LeaseDocumentPreview } from "@/components/portal/lease-document-preview";
import { LeasePrimaryHeaderActions } from "@/components/portal/lease-primary-header-actions";
import { LeaseAmendMoveOutModal, LeaseRenewModal } from "@/components/portal/lease-amend-move-out-modal";
import { applySignedLeaseRenewal } from "@/lib/lease-renewal-payments";
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
  leaseId: leaseIdProp,
  listBasePath,
}: {
  rows: LeasePipelineRow[];
  tab: ManagerLeaseTab;
  refreshKey: number;
  managerUserId?: string | null;
  residentAccountEmails: Set<string>;
  onEmailAccountSetup?: (email: string, name: string, axisId?: string) => void;
  leaseId?: string;
  listBasePath?: string;
}) {
  const { showToast } = useAppUi();
  const navigate = usePortalNavigate();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const uploadTargetRowIdRef = useRef<string | null>(null);
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
  const [renewLeaseRow, setRenewLeaseRow] = useState<LeasePipelineRow | null>(null);

  const handleAmendLeaseSuccess = useCallback(async () => {
    await syncLeasePipelineFromServer(managerUserId, { force: true });
    setAmendLeaseRow(null);
  }, [managerUserId]);

  function leaseSentToResidentBody(row: LeasePipelineRow): string {
    const unit = row.unit.trim() || "your unit";
    return buildLeaseReadyForResidentMessage({
      residentName: row.residentName || "there",
      residentEmail: row.residentEmail.trim(),
      unit,
      variant: "send",
    });
  }

  async function notifyResidentLeaseReady(row: LeasePipelineRow): Promise<{ ok: boolean; skipped?: boolean }> {
    const unit = row.unit.trim() || "your unit";
    const result = await deliverPortalInboxMessage({
      eventCategory: "leases",
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
    return buildLeaseReadyForResidentMessage({
      residentName: row.residentName || "there",
      residentEmail: row.residentEmail.trim(),
      unit,
      variant: "reminder",
      dateLine,
    });
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
        showToast("Email provider not configured. Opened a draft in your mail app.");
        return;
      }
      showToast(data.error ?? "Could not send account setup email.");
    } catch {
      showToast("Could not send account setup email.");
    } finally {
      setEmailBusyForRow(null);
    }
  }

  async function sendLeaseSigningReminder(
    row: LeasePipelineRow,
    recipient: string,
    subject: string,
    text: string,
    channels?: { viaEmail?: boolean; viaSms?: boolean },
  ) {
    setReminderBusyForRow(row.id);
    try {
      const res = await deliverPortalInboxMessage({
        eventCategory: "leases",
        fromName: "Property Manager",
        toEmails: [recipient],
        subject,
        text,
        deliverViaEmail: channels?.viaEmail !== false,
        deliverViaSms: channels?.viaSms === true,
      });

      if (!res.ok) {
        showToast(res.error ?? "Could not send lease signing reminder.");
        return;
      }

      appendLeaseThreadMessage(row.id, "manager", "Sent lease-signing reminder to resident.", managerUserId);
      if (res.skipped) {
        showToast("Reminder saved to PropLane inbox.");
      } else {
        showToast("Lease-signing reminder sent.");
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
  const hasLeaseDocument = (row: LeasePipelineRow) => Boolean(row.generatedHtml || row.managerUploadedPdf?.dataUrl);
  void refreshKey;
  const bucketRows = useMemo(() => rows.filter((r) => leaseRowMatchesManagerTab(r, tab)), [rows, tab]);
  const bucketRowIds = useMemo(() => bucketRows.map((r) => r.id), [bucketRows]);
  const selectedRow = useMemo(
    () => bucketRows.find((r) => r.id === expandedId) ?? null,
    [bucketRows, expandedId],
  );

  useEffect(() => {
    if (bucketRowIds.length === 0) {
      setExpandedId(null);
      setMobileDetailOpen(false);
      return;
    }
    setExpandedId((cur) => {
      if (cur && bucketRowIds.includes(cur)) return cur;
      if (portalUsesDesktopSplit()) return bucketRowIds[0] ?? null;
      return null;
    });
  }, [bucketRowIds]);

  useEffect(() => {
    if (!leaseIdProp) return;
    const decoded = decodeURIComponent(leaseIdProp);
    if (bucketRowIds.includes(decoded)) {
      setExpandedId(decoded);
      if (!portalUsesDesktopSplit()) setMobileDetailOpen(true);
    }
  }, [leaseIdProp, bucketRowIds]);

  useEffect(() => {
    setMobileDetailOpen(false);
    if (!portalUsesDesktopSplit() && !leaseIdProp) setExpandedId(null);
  }, [tab, leaseIdProp]);

  const navigateToList = useCallback(() => {
    if (listBasePath) navigate(leaseListHref(listBasePath, tab));
  }, [listBasePath, navigate, tab]);

  const openLeaseDetail = useCallback(
    (row: LeasePipelineRow) => {
      setExpandedId(row.id);
      setMobileDetailOpen(true);
      if (listBasePath) navigate(leaseDetailHref(listBasePath, tab, row.id));
    },
    [listBasePath, navigate, tab],
  );

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
      showToast("Print dialog opened. Choose 'Save as PDF' to download.");
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
    navigateToList();
  };

  const onManagerSign = (row: LeasePipelineRow) => {
    if (!residentHasSignedLease(row)) {
      showToast("The resident must sign first before the manager can countersign.");
      return;
    }
    setSigningRow(row);
  };

  const handleManagerModalSign = async (signatureName: string, consentVersion: string) => {
    if (!signingRow) return false;
    const ok = await managerSignLease(signingRow.id, signatureName.trim(), managerUserId, consentVersion);
    if (ok) {
      const fullySigned = hasBothLeaseSignatures({
        ...signingRow,
        managerSignature: { role: "manager", name: signatureName.trim(), signedAtIso: new Date().toISOString() },
      });
      // A renewal's new term/rent applies to the payment schedule only once
      // BOTH parties have signed — the manager countersigns last, so this is
      // the moment the renewed lease becomes the billing source of truth.
      const renewalApplied = fullySigned && signingRow.pendingRenewal
        ? applySignedLeaseRenewal(signingRow.id, managerUserId ?? null)
        : false;
      showToast(
        renewalApplied
          ? "Lease fully signed. Rent and payment schedule updated to the renewed terms."
          : fullySigned
            ? "Lease fully signed."
            : "Manager signature saved.",
      );
      setExpandedId(null);
      navigateToList();
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
      showToast("PDF saved. Resident sees this on their Lease tab.");
    } else showToast(res.error ?? "Upload failed.");
  };

  const renderLeaseHeaderActions = (row: LeasePipelineRow) => (
    <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="presentation">
      <LeasePrimaryHeaderActions
        row={row}
        btnClass={RESIDENT_DETAIL_HEADER_ACTION_BTN}
        downloadLabel="Download"
        downloadDataAttr="lease-download"
        signManagerDataAttr="lease-manager-sign"
        signingReminderDataAttr="lease-signing-reminder"
        deleteDataAttr="lease-delete"
        onDownload={() => onDownload(row)}
        onSignManager={() => onManagerSign(row)}
        onSigningReminder={() => openLeaseSigningReminderPreview(row)}
        signingReminderBusy={reminderBusyForRow === row.id}
        sendToResidentDataAttr="lease-send-resident"
        moveToManagerReviewDataAttr="lease-move-manager-review"
        onSendToResident={() => openSendLeasePreview(row)}
        sendToResidentBusy={sendingToResidentRowId === row.id}
        sendToResidentDisabled={
          !residentAccountEmails.has(row.residentEmail.trim().toLowerCase()) ||
          (!row.generatedHtml && !row.managerUploadedPdf?.dataUrl)
        }
        onMoveToManagerReview={() => onMoveToManagerReview(row)}
        onDelete={row.status !== "Fully Signed" ? () => onDeleteLease(row) : undefined}
      />
    </div>
  );

  const renderLeaseRowDetail = (row: LeasePipelineRow) => {
    const generation = generationGate(row);
    const canEditDocument = leaseAllowsManagerDocumentEdits(row);
    const showGenerate = !hasLeaseDocument(row) && canEditDocument;

    return (
    <>
      <PortalTableDetailActions placement="top">
            {showGenerate ? (
              <>
              <Button
                type="button"
                variant="outline"
                className={PORTAL_DETAIL_BTN}
                data-attr="lease-generate"
                disabled={generatingRowId === row.id || !generation.ok}
                title={generation.ok ? undefined : generation.error}
                onClick={() => runGenerateLease(row)}
              >
                {generatingRowId === row.id ? "Generating..." : "Generate lease"}
              </Button>
              {!generation.ok ? (
                <p className="max-w-xl text-xs leading-relaxed text-amber-800">{generation.error}</p>
              ) : null}
              </>
            ) : null}
            {hasBothLeaseSignatures(row) && row.status === "Fully Signed" ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className={PORTAL_DETAIL_BTN}
                  data-attr="lease-renew"
                  onClick={() => setRenewLeaseRow(row)}
                >
                  Renew lease
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={PORTAL_DETAIL_BTN}
                  onClick={() => setAmendLeaseRow(row)}
                >
                  Extend move-out date
                </Button>
              </>
            ) : null}
            {canEditDocument ? (
            <Button
              type="button"
              variant="outline"
              className={PORTAL_DETAIL_BTN}
              onClick={() => {
                uploadTargetRowIdRef.current = row.id;
                uploadRef.current?.click();
              }}
              disabled={pendingRowId === row.id}
            >
              {pendingRowId === row.id ? "Uploading…" : hasLeaseDocument(row) ? "Upload replacement" : "Upload PDF"}
            </Button>
            ) : null}

            {row.status === "Manager Review" || row.status === "Draft" ? (
              !residentAccountEmails.has(row.residentEmail.trim().toLowerCase()) ? (
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
                ) : null
            ) : null}
      </PortalTableDetailActions>

      <LeaseDocumentPreview row={row} />
    </>
    );
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
    <>
      {signingRow ? (
        <LeaseSigningModal
          row={signingRow}
          signerName=""
          signerRoleLabel="Manager / authorized agent name"
          onSign={handleManagerModalSign}
          onClose={() => setSigningRow(null)}
        />
      ) : null}
      <PortalNotificationPreviewModal
        open={leaseSentPreview !== null}
        title="Send lease to resident · preview"
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
        title="Lease signing reminder · preview"
        onClose={() => setLeaseReminderPreview(null)}
        recipient={leaseReminderPreview?.recipient ?? ""}
        subject={leaseReminderPreview?.subject ?? ""}
        body={leaseReminderPreview?.body ?? ""}
        showSkipMessage={false}
        showChannelPicker
        emailAvailable
        smsAvailable
        confirmLabel="Send reminder"
        confirmBusy={Boolean(leaseReminderPreview?.row && reminderBusyForRow === leaseReminderPreview.row.id)}
        confirmBusyLabel="Sending…"
        onConfirm={(skipMessage, channels) => {
          if (!leaseReminderPreview) return;
          if (skipMessage) {
            setLeaseReminderPreview(null);
            return;
          }
          const preview = leaseReminderPreview;
          setLeaseReminderPreview(null);
          void sendLeaseSigningReminder(
            preview.row,
            preview.recipient,
            preview.subject,
            preview.body,
            channels,
          );
        }}
      />
      <input
        ref={uploadRef}
        type="file"
        accept="application/pdf"
        className="sr-only"
        aria-hidden
        onChange={(e) => {
          const id = uploadTargetRowIdRef.current;
          uploadTargetRowIdRef.current = null;
          if (id) void onPickUpload(id, e.target.files);
        }}
      />
      <PortalListDetailPane
        mobileCompact
        className="max-md:rounded-xl max-md:shadow-[var(--shadow-sm)]"
        detailOpen={mobileDetailOpen && Boolean(selectedRow)}
        list={
          <div className={INBOX_LIST_SCROLL}>
            {bucketRows.map((row) => (
              <PortalPersonRecordRow
                key={row.id}
                name={row.residentName}
                subtitle={row.unit}
                preview={row.status}
                badge={
                  row.leaseKind === "joint_bundle" ? (
                    <Badge tone="neutral">Joint bundle</Badge>
                  ) : undefined
                }
                selected={expandedId === row.id}
                onOpen={() => openLeaseDetail(row)}
                dataAttr="lease-list-row"
              />
            ))}
          </div>
        }
        detail={
          selectedRow ? (
            <div className="flex h-full min-h-0 flex-col">
              <PortalDetailHeader
                title={selectedRow.residentName}
                subtitle={selectedRow.unit}
                avatarName={selectedRow.residentName}
                onBack={() => {
                  setMobileDetailOpen(false);
                  navigateToList();
                }}
                backLabel="Back to leases"
                dataAttrBack="lease-detail-back"
                actions={renderLeaseHeaderActions(selectedRow)}
              />
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2 [-webkit-overflow-scrolling:touch] md:px-3 md:py-3">
                {renderLeaseRowDetail(selectedRow)}
              </div>
            </div>
          ) : (
            <PortalListDetailPlaceholder
              title="Select a lease"
              hint="Choose a resident from the list to review and sign their lease."
            />
          )
        }
      />

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

      {renewLeaseRow ? (
        <LeaseRenewModal
          open
          onClose={() => setRenewLeaseRow(null)}
          currentEnd={renewLeaseRow.application?.leaseEnd ?? ""}
          currentTerm={renewLeaseRow.application?.leaseTerm ?? ""}
          currentRentLabel={renewLeaseRow.signedRentLabel ?? renewLeaseRow.application?.managerRentOverride ?? ""}
          leaseId={renewLeaseRow.id}
          onSuccess={() => void handleAmendLeaseSuccess()}
        />
      ) : null}
    </>
  );
}
