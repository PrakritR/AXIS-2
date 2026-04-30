"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { LeaseDocumentPreview } from "@/components/portal/lease-document-preview";
import { LeaseSigningModal } from "@/components/portal/lease-signing-modal";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
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
  downloadLeaseFromRow,
  findLeaseForResidentEmail,
  hasBothLeaseSignatures,
  printLeaseAsPdf,
  residentCanViewLeaseRow,
  residentRequestEdits,
  residentSendLeaseToManager,
  residentSignLease,
  residentUploadLeasePdf,
  syncLeasePipelineFromServer,
} from "@/lib/lease-pipeline-storage";
import { usePortalSession } from "@/hooks/use-portal-session";

export function ResidentLeasePanel() {
  const { showToast } = useAppUi();
  const session = usePortalSession();
  const uploadRef = useRef<HTMLInputElement>(null);
  const [pipelineTick, setPipelineTick] = useState(0);
  const [editRequestDraft, setEditRequestDraft] = useState("");
  const [showSigningModal, setShowSigningModal] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const email = session.email?.trim() || null;

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
    if (!email) return null;
    return findLeaseForResidentEmail(email);
  }, [email, pipelineTick]);

  const leaseCtx = useMemo(() => {
    if (pipelineRow?.application && Object.keys(pipelineRow.application).length > 0) {
      return leaseContextFromApplication(pipelineRow.application);
    }
    return gatherLeaseGenerationContext();
  }, [pipelineRow]);

  const leaseLocked = Boolean(pipelineRow && hasBothLeaseSignatures(pipelineRow));
  const leaseVisibleToResident = residentCanViewLeaseRow(pipelineRow);
  const usesElectronicSigning = Boolean(pipelineRow?.generatedHtml && !pipelineRow?.managerUploadedPdf?.dataUrl);

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

  const canSignElectronically = Boolean(
    usesElectronicSigning && pipelineRow?.status === "Resident Signature Pending" && !pipelineRow.residentSignature && !leaseLocked,
  );
  const residentLeaseActions = Boolean(pipelineRow?.status === "Resident Signature Pending" && !leaseLocked);
  const canRequestExtension = Boolean(pipelineRow?.status === "Fully Signed");
  const canUseManualPdfFlow = Boolean(
    pipelineRow?.managerUploadedPdf?.dataUrl && pipelineRow?.status === "Resident Signature Pending" && !leaseLocked,
  );

  const onDownloadAiLease = useCallback(() => {
    downloadAiGeneratedLeaseHtml(leaseCtx);
    showToast("Downloading — open the file and use Print → Save as PDF to get a PDF.");
  }, [leaseCtx, showToast]);

  const onDownloadLeasePackage = useCallback(() => {
    if (pipelineRow) {
      if (pipelineRow.managerUploadedPdf?.dataUrl) {
        downloadLeaseFromRow(pipelineRow);
        showToast("PDF download started.");
        return;
      }
      if (pipelineRow.generatedHtml) {
        printLeaseAsPdf(pipelineRow);
        showToast("Print dialog opened — choose 'Save as PDF' to download.");
        return;
      }
      showToast("Ask your manager to generate the lease, or upload your PDF below.");
      return;
    }
    onDownloadAiLease();
  }, [pipelineRow, onDownloadAiLease, showToast]);

  const onSignLease = () => {
    if (!email || leaseLocked) return;
    if (pipelineRow?.bucket !== "resident") {
      showToast("Signing opens when your manager sends the lease to you for resident signature.");
      return;
    }
    setShowSigningModal(true);
  };

  const handleModalSign = (signatureName: string) => {
    if (!email || !pipelineRow) return false;
    if (residentSignLease(email, signatureName)) {
      const signedRow = {
        ...pipelineRow,
        residentSignature: { role: "resident" as const, name: signatureName, signedAtIso: new Date().toISOString() },
      };
      showToast(hasBothLeaseSignatures(signedRow) ? "Lease fully signed." : "Lease signed. Your manager still needs to sign.");
      setPipelineTick((t) => t + 1);
      setShowSigningModal(false);
      return true;
    } else {
      showToast("Could not sign — try again.");
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

  if ((!pipelineRow || !leaseVisibleToResident) && email) {
    return (
      <ManagerPortalPageShell title="Lease">
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
            <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
          </div>
          <div>
            <p className="text-lg font-bold text-slate-900">Your lease is being prepared</p>
            <p className="mt-1.5 max-w-sm text-sm text-slate-600">
              Once your manager finalises and sends your lease to you, it will appear here ready for review and signature.
            </p>
          </div>
          <p className="text-xs text-slate-400">Check back soon — this page updates automatically.</p>
        </div>
      </ManagerPortalPageShell>
    );
  }

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
        agreementLabel="Residential Room Rental Agreement"
        onSign={handleModalSign}
        onClose={() => setShowSigningModal(false)}
      />
    ) : null}
    <ManagerPortalPageShell
      title="Lease"
      titleAside={
        <>
          {canRequestExtension ? (
            <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={() => showToast("Extension request sent.")}>
              Request extension
            </Button>
          ) : null}
          {canUseManualPdfFlow ? (
            <>
              <Button
                type="button"
                variant="outline"
                className="shrink-0 rounded-full"
                onClick={() => uploadRef.current?.click()}
                disabled={uploadingPdf}
              >
                {uploadingPdf ? "Uploading PDF..." : "Upload PDF"}
              </Button>
              <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={onSendToManager}>
                Send to manager
              </Button>
            </>
          ) : null}
          <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={onDownloadLeasePackage}>
            Download PDF
          </Button>
          {usesElectronicSigning ? (
            <Button
              type="button"
              variant="primary"
              className="shrink-0 rounded-full"
              disabled={!canSignElectronically}
              onClick={() => onSignLease()}
            >
              {pipelineRow?.residentSignature ? "Resident signed" : "Sign lease"}
            </Button>
          ) : null}
        </>
      }
    >
      {leaseVisibleToResident && pipelineRow ? (
        <div className="mb-6">
          <LeaseDocumentPreview
            className="mt-0"
            row={pipelineRow}
            emptyHint="Your manager will generate or upload your lease here. When it's ready, the full agreement appears in this preview."
          />
          {pipelineRow.managerSignature || pipelineRow.residentSignature ? (
            <Card className="mt-4 border-emerald-200/80 bg-emerald-50/60 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Signature status</p>
              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="font-semibold text-slate-800">Manager</p>
                  <p className={pipelineRow.managerSignature ? "text-emerald-800" : "text-amber-700"}>
                    {pipelineRow.managerSignature
                      ? `Signed by ${pipelineRow.managerSignature.name} · ${new Date(pipelineRow.managerSignature.signedAtIso).toLocaleString()}`
                      : "Pending signature"}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-slate-800">Resident</p>
                  <p className={pipelineRow.residentSignature ? "text-emerald-800" : "text-amber-700"}>
                    {pipelineRow.residentSignature
                      ? `Signed by ${pipelineRow.residentSignature.name} · ${new Date(pipelineRow.residentSignature.signedAtIso).toLocaleString()}`
                      : "Pending signature"}
                  </p>
                </div>
              </div>
            </Card>
          ) : null}
          {pipelineRow.managerUploadedPdf?.dataUrl && pipelineRow.status === "Resident Signature Pending" ? (
            <Card className="mt-4 border-sky-200/80 bg-sky-50/70 p-4 text-sm text-sky-950">
              This lease was uploaded as a manual PDF. Review it here, sign it offline, and return the signed lease to your manager.
            </Card>
          ) : null}
        </div>
      ) : null}

      {leaseVisibleToResident && pipelineRow?.thread?.length ? (
        <Card className="border-slate-200/80 p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Messages</p>
          <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto">
            {pipelineRow.thread.map((m) => (
              <li key={m.id} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                <span className="font-semibold capitalize text-slate-800">{m.role}</span>
                <span className="text-xs text-slate-400"> · {new Date(m.at).toLocaleString()}</span>
                <p className="mt-1 whitespace-pre-wrap text-slate-700">{m.body}</p>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">
            Stage: <span className="font-semibold">{pipelineRow.stageLabel}</span>
          </p>
        </Card>
      ) : null}

      {residentLeaseActions && email ? (
        <Card className="border-slate-200/80 p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Request edits</p>
          <p className="mt-1 text-sm text-slate-600">Send a note to your property manager if the lease needs changes. The lease will return to manager review.</p>
          <textarea
            rows={3}
            value={editRequestDraft}
            onChange={(e) => setEditRequestDraft(e.target.value)}
            placeholder="What needs to change in the lease?"
            className="mt-3 w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800"
          />
          <Button
            type="button"
            variant="outline"
            className="mt-3 rounded-full"
            onClick={() => {
              if (!email || !editRequestDraft.trim()) {
                showToast("Describe what should change.");
                return;
              }
              if (residentRequestEdits(email, editRequestDraft.trim())) {
                showToast("Edit request sent to your manager.");
                setEditRequestDraft("");
                setPipelineTick((t) => t + 1);
              } else showToast("Could not send request.");
            }}
          >
            Send edit request
          </Button>
        </Card>
      ) : null}

      {upgradeBreakdown ? (
        <Card className="mt-6 border-blue-200/80 bg-blue-50/40 p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Upgrade to long-term rental</p>
          <p className="mt-1.5 text-sm text-slate-700">
            You are currently on a short-term stay. Upgrading creates a new long-term lease. Rent is due on the <strong>1st of every month</strong>; your first month will be prorated based on your move-in date.
          </p>
          <div className="mt-4 space-y-1 text-sm">
            <div className="flex justify-between gap-3 border-b border-blue-100 pb-2">
              <span className="text-slate-600">Application fee</span>
              <span className="font-medium text-emerald-700">{upgradeBreakdown.applicationFee.label}</span>
            </div>
            <div className="flex justify-between gap-3 border-b border-blue-100 py-2">
              <span className="text-slate-600">Move-in fee balance</span>
              <span className="font-semibold text-slate-900">{upgradeBreakdown.moveInFee.label}</span>
            </div>
            <div className="flex justify-between gap-3 border-b border-blue-100 py-2">
              <span className="text-slate-600">Security deposit balance</span>
              <span className="font-semibold text-slate-900">{upgradeBreakdown.securityDeposit.label}</span>
            </div>
            {upgradeBreakdownMtm?.monthToMonthSurcharge.label ? (
              <div className="flex justify-between gap-3 border-b border-blue-100 py-2">
                <span className="text-slate-600">Month-to-month option</span>
                <span className="font-medium text-amber-700">+{upgradeBreakdownMtm.monthToMonthSurcharge.label}</span>
              </div>
            ) : null}
            <div className="flex justify-between gap-3 pt-2">
              <span className="font-semibold text-slate-800">Total due to upgrade</span>
              <span className="font-bold text-slate-900">${upgradeBreakdown.totalDue.toFixed(2)}</span>
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
          <p className="mt-3 text-xs text-slate-500">
            Payments will update automatically in your Payments tab once the manager processes your upgrade. If you switch to month-to-month, a new lease at the adjusted rate is required.
          </p>
        </Card>
      ) : null}

    </ManagerPortalPageShell>
    </>
  );
}
