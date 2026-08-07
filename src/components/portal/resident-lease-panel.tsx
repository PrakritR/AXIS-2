"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { LeaseAmendMoveOutModal } from "@/components/portal/lease-amend-move-out-modal";
import { LeaseDocumentPreview } from "@/components/portal/lease-document-preview";
import { LeaseSigningModal } from "@/components/portal/lease-signing-modal";
import { ManagerPortalPageShell, PORTAL_HEADER_ACTION_BTN } from "@/components/portal/portal-metrics";
import { PortalSectionActionRow } from "@/components/portal/portal-section-action-row";
import { PortalEmptyState } from "@/components/portal/portal-empty-state";
import {
  shortToLongTermUpgradeBreakdown,
} from "@/lib/household-charges";
import {
  downloadAiGeneratedLeaseHtml,
  gatherLeaseGenerationContext,
  leaseContextFromApplication,
} from "@/lib/generated-lease";
import {
  LEASE_PIPELINE_EVENT,
  findLeaseForResidentEmail,
  hasBothLeaseSignatures,
  runLeaseDownload,
  residentCanViewLeaseRow,
  residentLeaseAuthorized,
  residentSendLeaseToManager,
  residentSignLease,
  residentUploadLeasePdf,
  syncLeasePipelineFromServer,
} from "@/lib/lease-pipeline-storage";
import { useResidentPortalAxisContext } from "@/hooks/use-resident-portal-axis";

/**
 * Self-contained resident Lease tab: review + sign the lease and download or
 * upload the document. General document uploads live in Documents › Other
 * documents, not here.
 */
export function ResidentLeasePanel() {
  const { showToast } = useAppUi();
  const uploadRef = useRef<HTMLInputElement>(null);
  const [pipelineTick, setPipelineTick] = useState(0);
  const [showSigningModal, setShowSigningModal] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [showMoveOutModal, setShowMoveOutModal] = useState(false);
  const { email, residentAxisId, profileManagerId, axisResolved } = useResidentPortalAxisContext();

  useEffect(() => {
    const on = () => setPipelineTick((t) => t + 1);
    void syncLeasePipelineFromServer().then(on);
    window.addEventListener(LEASE_PIPELINE_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(LEASE_PIPELINE_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);

  const pipelineRow = useMemo(() => {
    void pipelineTick;
    if (!email || !axisResolved) return null;
    return findLeaseForResidentEmail(email, {
      email,
      residentAxisId,
      profileManagerId,
    });
  }, [axisResolved, email, pipelineTick, profileManagerId, residentAxisId]);

  const leaseAuthorized = useMemo(() => {
    if (!pipelineRow || !email) return false;
    return residentLeaseAuthorized(pipelineRow, {
      email,
      residentAxisId,
      profileManagerId,
    });
  }, [pipelineRow, email, residentAxisId, profileManagerId]);

  const leaseCtx = useMemo(() => {
    if (pipelineRow?.application && Object.keys(pipelineRow.application).length > 0) {
      return leaseContextFromApplication(pipelineRow.application);
    }
    return gatherLeaseGenerationContext();
  }, [pipelineRow]);

  const leaseFullyExecuted = Boolean(pipelineRow && hasBothLeaseSignatures(pipelineRow));
  const leaseVisibleToResident = residentCanViewLeaseRow(pipelineRow) && leaseAuthorized;
  const isPreparingLease = Boolean(email && (!pipelineRow || !leaseVisibleToResident));
  const isPendingLease = Boolean(pipelineRow && leaseVisibleToResident && !leaseFullyExecuted);
  const isSignedLease = Boolean(pipelineRow && leaseVisibleToResident && leaseFullyExecuted);

  const residentAlreadySigned = Boolean(pipelineRow?.residentSignature);
  const showSigningWorkflowActions = !leaseFullyExecuted && pipelineRow?.status !== "Fully Signed";

  const upgradeBreakdown = useMemo(() => {
    const propertyId = pipelineRow?.propertyId ?? pipelineRow?.application?.propertyId ?? leaseCtx.application?.propertyId;
    if (!propertyId) return null;
    const leaseTerm = pipelineRow?.application?.leaseTerm ?? leaseCtx.application?.leaseTerm ?? "";
    const isShortTerm = leaseTerm.toLowerCase().includes("short") || leaseTerm.toLowerCase().includes("daily");
    if (!isShortTerm) return null;
    return shortToLongTermUpgradeBreakdown(propertyId, false);
  }, [pipelineRow, leaseCtx.application]);

  const upgradeBreakdownMtm = useMemo(() => {
    const propertyId = pipelineRow?.propertyId ?? pipelineRow?.application?.propertyId ?? leaseCtx.application?.propertyId;
    if (!propertyId) return null;
    const leaseTerm = pipelineRow?.application?.leaseTerm ?? leaseCtx.application?.leaseTerm ?? "";
    const isShortTerm = leaseTerm.toLowerCase().includes("short") || leaseTerm.toLowerCase().includes("daily");
    if (!isShortTerm) return null;
    return shortToLongTermUpgradeBreakdown(propertyId, true);
  }, [pipelineRow, leaseCtx.application]);

  const onDownloadAiLease = useCallback(() => {
    downloadAiGeneratedLeaseHtml(leaseCtx);
    showToast("Downloading. Open the file and use Print → Save as PDF to get a PDF.");
  }, [leaseCtx, showToast]);

  const onDownloadLeasePackage = useCallback(() => {
    if (pipelineRow) {
      runLeaseDownload(pipelineRow, showToast);
      return;
    }
    onDownloadAiLease();
  }, [pipelineRow, onDownloadAiLease, showToast]);

  const onSignLease = () => {
    if (!email || leaseFullyExecuted) return;
    if (pipelineRow?.bucket !== "resident") {
      showToast("Signing opens when your manager sends the lease to you for resident signature.");
      return;
    }
    setShowSigningModal(true);
  };

  const handleModalSign = async (signatureName: string, consentVersion: string) => {
    if (!email || !pipelineRow) return false;
    const ok = await residentSignLease(email, signatureName, consentVersion);
    if (ok) {
      const signedRow = {
        ...pipelineRow,
        residentSignature: { role: "resident" as const, name: signatureName, signedAtIso: new Date().toISOString() },
      };
      showToast(hasBothLeaseSignatures(signedRow) ? "Lease fully signed." : "Lease signed. Your manager still needs to sign.");
      setPipelineTick((t) => t + 1);
      setShowSigningModal(false);
      return true;
    } else {
      showToast("Could not sign. Try again.");
      return false;
    }
  };

  const onUploadResidentPdf = async (file: File | null | undefined) => {
    if (!file || !email) return;
    setUploadingPdf(true);
    const result = await residentUploadLeasePdf(email, file);
    setUploadingPdf(false);
    if (uploadRef.current) uploadRef.current.value = "";
    if (result.ok) {
      setPipelineTick((t) => t + 1);
      showToast("Signed PDF uploaded.");
    } else {
      showToast(result.error ?? "Upload failed.");
    }
  };

  const onSendToManager = () => {
    if (!email) return;
    if (residentSendLeaseToManager(email)) {
      setPipelineTick((t) => t + 1);
      showToast("Lease sent to manager.");
    } else {
      showToast("Upload the signed PDF first, then send it to your manager.");
    }
  };

  const handleMoveOutSuccess = useCallback(async () => {
    await syncLeasePipelineFromServer(undefined, { force: true });
    setPipelineTick((t) => t + 1);
  }, []);

  const renderLeaseContent = () => {
    if (!email) {
      return <p className="text-sm text-muted">Sign in to view your lease.</p>;
    }
    if (!axisResolved) {
      return (
        <PortalEmptyState
          variant="plain"
          icon="lease"
          title="Loading your lease…"
        />
      );
    }
    if (isPreparingLease) {
      return (
        <PortalEmptyState
          variant="plain"
          icon="lease"
          title="Your lease is being prepared. Once your manager sends it, it will appear here for review and signature."
        />
      );
    }
    if (!pipelineRow) {
      return null;
    }

    const previewHint = isSignedLease
      ? "Your signed lease will appear here."
      : "Your manager will generate or upload your lease here. When it's ready, the full agreement appears in this preview.";

    return (
      <>
        <div className="mb-6">
          <LeaseDocumentPreview className="mt-0" row={pipelineRow} emptyHint={previewHint} />
          {isPendingLease &&
          pipelineRow.managerUploadedPdf?.dataUrl &&
          pipelineRow.status === "Resident Signature Pending" ? (
            <p className="mt-3 rounded-lg border border-border bg-[var(--status-approved-bg)] px-3 py-2.5 text-sm leading-snug text-[var(--status-approved-fg)]">
              Sign in the portal to append an electronic signature page, or upload a manually signed PDF if you prefer.
            </p>
          ) : null}
        </div>
        {isSignedLease && upgradeBreakdown ? (
          <div className="mt-4 rounded-xl border border-border bg-card p-3 sm:p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--status-approved-fg)]">Upgrade to long-term rental</p>
            <p className="mt-1.5 text-sm text-muted">
              You are currently on a short-term stay. Upgrading creates a new long-term lease. Rent is due on the <strong>1st of every month</strong>; your first month will be prorated based on your move-in date.
            </p>
            <div className="mt-4 space-y-1 text-sm">
              <div className="flex justify-between gap-3 border-b border-blue-100 pb-2">
                <span className="text-muted">Application fee</span>
                <span className="font-medium text-emerald-700">{upgradeBreakdown.applicationFee.label}</span>
              </div>
              <div className="flex justify-between gap-3 border-b border-blue-100 py-2">
                <span className="text-muted">Move-in fee balance</span>
                <span className="font-semibold text-foreground">{upgradeBreakdown.moveInFee.label}</span>
              </div>
              <div className="flex justify-between gap-3 border-b border-blue-100 py-2">
                <span className="text-muted">Security deposit balance</span>
                <span className="font-semibold text-foreground">{upgradeBreakdown.securityDeposit.label}</span>
              </div>
              {upgradeBreakdownMtm?.monthToMonthSurcharge.label ? (
                <div className="flex justify-between gap-3 border-b border-blue-100 py-2">
                  <span className="text-muted">Month-to-month option</span>
                  <span className="font-medium text-amber-700">+{upgradeBreakdownMtm.monthToMonthSurcharge.label}</span>
                </div>
              ) : null}
              <div className="flex justify-between gap-3 pt-2">
                <span className="font-semibold text-foreground">Total due to upgrade</span>
                <span className="font-bold text-foreground">${upgradeBreakdown.totalDue.toFixed(2)}</span>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="primary"
                className="rounded-full text-sm"
                onClick={() => showToast("Upgrade request sent to your manager. They will prepare your new long-term lease.")}
              >
                Request upgrade to long-term
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-full text-sm"
                onClick={() => showToast("Month-to-month upgrade request sent. Your manager will prepare the lease with the surcharge included.")}
              >
                Request month-to-month
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted">
              Payments will update automatically in your Payments tab once the manager processes your upgrade. If you switch to month-to-month, a new lease at the adjusted rate is required.
            </p>
          </div>
        ) : null}
      </>
    );
  };

  const leaseTitleAside =
    isPendingLease && pipelineRow ? (
      <PortalSectionActionRow variant="header" className="hidden gap-2 md:flex">
        <Button
          type="button"
          variant="outline"
          className={PORTAL_HEADER_ACTION_BTN}
          onClick={onDownloadLeasePackage}
        >
          Download
        </Button>
        {showSigningWorkflowActions && !residentAlreadySigned ? (
          <>
            <Button
              type="button"
              variant="outline"
              className={PORTAL_HEADER_ACTION_BTN}
              onClick={() => uploadRef.current?.click()}
              disabled={uploadingPdf}
            >
              {uploadingPdf ? "Uploading..." : "Upload"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className={PORTAL_HEADER_ACTION_BTN}
              onClick={onSendToManager}
            >
              Send to manager
            </Button>
            <Button
              type="button"
              variant="primary"
              className={PORTAL_HEADER_ACTION_BTN}
              data-attr="resident-sign-lease"
              onClick={() => onSignLease()}
            >
              Sign lease
            </Button>
          </>
        ) : null}
      </PortalSectionActionRow>
    ) : isSignedLease && pipelineRow ? (
      <PortalSectionActionRow variant="header" className="hidden gap-2 md:flex">
        <Button
          type="button"
          variant="outline"
          className={PORTAL_HEADER_ACTION_BTN}
          onClick={() => setShowMoveOutModal(true)}
        >
          Renew
        </Button>
        <Button
          type="button"
          variant="outline"
          className={PORTAL_HEADER_ACTION_BTN}
          onClick={onDownloadLeasePackage}
        >
          Download
        </Button>
      </PortalSectionActionRow>
    ) : null;

  const leaseMobileActionsRow = leaseTitleAside ? (
    <div
      className="mb-3 flex flex-wrap gap-2 md:hidden [&_button]:min-w-0 [&_button]:flex-1"
      data-slot="resident-lease-mobile-actions"
    >
      {isPendingLease && pipelineRow ? (
        <>
          <Button type="button" variant="outline" className={PORTAL_HEADER_ACTION_BTN} onClick={onDownloadLeasePackage}>
            Download
          </Button>
          {showSigningWorkflowActions && !residentAlreadySigned ? (
            <>
              <Button
                type="button"
                variant="outline"
                className={PORTAL_HEADER_ACTION_BTN}
                onClick={() => uploadRef.current?.click()}
                disabled={uploadingPdf}
              >
                {uploadingPdf ? "Uploading..." : "Upload"}
              </Button>
              <Button type="button" variant="outline" className={PORTAL_HEADER_ACTION_BTN} onClick={onSendToManager}>
                Send to manager
              </Button>
              <Button
                type="button"
                variant="primary"
                className={PORTAL_HEADER_ACTION_BTN}
                data-attr="resident-sign-lease"
                onClick={() => onSignLease()}
              >
                Sign lease
              </Button>
            </>
          ) : null}
        </>
      ) : isSignedLease && pipelineRow ? (
        <>
          <Button type="button" variant="outline" className={PORTAL_HEADER_ACTION_BTN} onClick={() => setShowMoveOutModal(true)}>
            Renew
          </Button>
          <Button type="button" variant="outline" className={PORTAL_HEADER_ACTION_BTN} onClick={onDownloadLeasePackage}>
            Download
          </Button>
        </>
      ) : null}
    </div>
  ) : null;

  return (
    <>
      <input
        ref={uploadRef}
        type="file"
        accept="application/pdf"
        className="sr-only"
        aria-hidden
        onChange={(e) => void onUploadResidentPdf(e.target.files?.[0])}
      />
      {showSigningModal && pipelineRow ? (
        <LeaseSigningModal
          row={pipelineRow}
          signerName={leaseCtx.application?.fullLegalName ?? pipelineRow.residentName ?? ""}
          signerRoleLabel="Your full legal name"
          onSign={handleModalSign}
          onClose={() => setShowSigningModal(false)}
        />
      ) : null}

      <LeaseAmendMoveOutModal
        open={showMoveOutModal}
        onClose={() => setShowMoveOutModal(false)}
        currentEnd={pipelineRow?.application?.leaseEnd ?? ""}
        leaseStart={pipelineRow?.application?.leaseStart ?? ""}
        checkUrl="/api/resident/check-move-out-availability"
        amendUrl="/api/resident/extend-lease"
        onSuccess={() => void handleMoveOutSuccess()}
      />

      <ManagerPortalPageShell
        title="Lease"
        hideTitleOnMobileNav
        titleAside={leaseTitleAside}
        compactFilterRow
      >
        {leaseMobileActionsRow}
        {renderLeaseContent()}
      </ManagerPortalPageShell>
    </>
  );
}
