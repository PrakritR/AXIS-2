"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { LeaseAmendMoveOutModal } from "@/components/portal/lease-amend-move-out-modal";
import { LeaseDocumentPreview } from "@/components/portal/lease-document-preview";
import { LeaseReportIssueModal } from "@/components/portal/lease-report-issue-modal";
import { LeaseSigningModal } from "@/components/portal/lease-signing-modal";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { deliverPortalInboxMessage } from "@/lib/portal-message-delivery";
import { safeFormatDateTime } from "@/lib/pacific-time";
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
  appendLeaseThreadMessage,
  downloadLeaseFromRow,
  findLeaseForResidentEmail,
  hasBothLeaseSignatures,
  printLeaseAsPdf,
  residentCanViewLeaseRow,
  residentLeaseAuthorized,
  residentSendLeaseToManager,
  residentSignLease,
  residentUploadLeasePdf,
  syncLeasePipelineFromServer,
} from "@/lib/lease-pipeline-storage";
import { resolveResidentPortalAxisId } from "@/lib/manager-applications-storage";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { usePortalSession } from "@/hooks/use-portal-session";
import { isDemoModeActive } from "@/lib/demo/demo-session";

/**
 * Self-contained resident Lease tab: review + sign the lease, report an issue
 * to the manager at any point (delivered to their inbox and email), and
 * download or upload the document. General document uploads live in
 * Documents › Other documents, not here.
 */
export function ResidentLeasePanel() {
  const { showToast } = useAppUi();
  const session = usePortalSession();
  const uploadRef = useRef<HTMLInputElement>(null);
  const [pipelineTick, setPipelineTick] = useState(0);
  const [showSigningModal, setShowSigningModal] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [showMoveOutModal, setShowMoveOutModal] = useState(false);
  const [reportIssueOpen, setReportIssueOpen] = useState(false);
  const [reportIssueBusy, setReportIssueBusy] = useState(false);
  const [residentAxisId, setResidentAxisId] = useState("");
  const email = session.email?.trim() || null;

  useEffect(() => {
    if (!session.userId) return;
    // Demo sandbox: never resolve an axis id from the real Supabase browser
    // session — a visitor signed in to a real account would resolve THEIR id,
    // which mismatches the seeded demo lease and hides it after first paint.
    if (isDemoModeActive()) return;
    let cancelled = false;
    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const [{ data: profile }, { data: authUser }] = await Promise.all([
          supabase.from("profiles").select("manager_id").eq("id", session.userId).maybeSingle(),
          supabase.auth.getUser(),
        ]);
        if (cancelled) return;
        const meta = authUser?.user?.user_metadata as Record<string, unknown> | undefined;
        const metaAxis = typeof meta?.axis_id === "string" ? meta.axis_id : null;
        setResidentAxisId(
          resolveResidentPortalAxisId({
            profileManagerId: profile?.manager_id,
            authUserAxisId: metaAxis,
          }),
        );
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session.userId]);

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
    return findLeaseForResidentEmail(email, {
      email,
      residentAxisId,
      profileManagerId: residentAxisId,
    });
  }, [email, pipelineTick, residentAxisId]);

  const leaseAuthorized = useMemo(() => {
    if (!pipelineRow || !email) return false;
    return residentLeaseAuthorized(pipelineRow, {
      email,
      residentAxisId,
      profileManagerId: residentAxisId,
    });
  }, [pipelineRow, email, residentAxisId]);

  const leaseCtx = useMemo(() => {
    if (pipelineRow?.application && Object.keys(pipelineRow.application).length > 0) {
      return leaseContextFromApplication(pipelineRow.application);
    }
    return gatherLeaseGenerationContext();
  }, [pipelineRow]);

  /** Both manager AND resident signatures present. */
  const leaseFullyExecuted = Boolean(pipelineRow && hasBothLeaseSignatures(pipelineRow));
  const leaseVisibleToResident = residentCanViewLeaseRow(pipelineRow) && leaseAuthorized;

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
    if (!email || leaseFullyExecuted) return;
    if (pipelineRow?.bucket !== "resident") {
      showToast("Signing opens when your manager sends the lease to you for resident signature.");
      return;
    }
    setShowSigningModal(true);
  };

  const handleModalSign = async (signatureName: string) => {
    if (!email || !pipelineRow) return false;
    const ok = await residentSignLease(email, signatureName);
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

  const handleMoveOutSuccess = useCallback(async () => {
    await syncLeasePipelineFromServer(undefined, { force: true });
    setPipelineTick((t) => t + 1);
  }, []);

  const onSubmitReportIssue = async (subject: string, message: string) => {
    if (!pipelineRow || !email || reportIssueBusy) return;
    setReportIssueBusy(true);
    try {
      const leaseLabel = `${pipelineRow.residentName || "Resident"} — ${pipelineRow.unit || "unit"}`;
      const fullSubject = `Lease issue — ${leaseLabel}: ${subject}`;
      const body = [`Lease: ${leaseLabel}`, "", message, "", pipelineRow.residentName || "Resident"].join("\n");
      const delivery = await deliverPortalInboxMessage({
        fromName: pipelineRow.residentName || "Resident",
        toBroadcast: ["management"],
        subject: fullSubject,
        text: body,
      });
      appendLeaseThreadMessage(pipelineRow.id, "resident", `${subject}\n\n${message}`);
      if (delivery.ok) {
        showToast(
          delivery.skipped
            ? "Message sent to your manager's Axis inbox."
            : "Message sent to your manager's Axis inbox and email.",
        );
        setReportIssueOpen(false);
        setPipelineTick((t) => t + 1);
      } else {
        showToast(delivery.error ?? "Could not send message.");
      }
    } finally {
      setReportIssueBusy(false);
    }
  };

  if ((!pipelineRow || !leaseVisibleToResident) && email) {
    const preparing = (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--glass-fill)] ring-1 ring-border">
          <svg className="h-8 w-8 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
        </div>
        <div>
          <p className="text-lg font-bold text-foreground">Your lease is being prepared</p>
          <p className="mt-1.5 max-w-sm text-sm text-muted">
            Once your manager finalises and sends your lease to you, it will appear here ready for review and signature.
          </p>
        </div>
        <p className="text-xs text-muted">Check back soon — this page updates automatically.</p>
      </div>
    );
    return <ManagerPortalPageShell title="Lease">{preparing}</ManagerPortalPageShell>;
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

      <LeaseAmendMoveOutModal
        open={showMoveOutModal}
        onClose={() => setShowMoveOutModal(false)}
        currentEnd={pipelineRow?.application?.leaseEnd ?? ""}
        leaseStart={pipelineRow?.application?.leaseStart ?? ""}
        checkUrl="/api/resident/check-move-out-availability"
        amendUrl="/api/resident/extend-lease"
        onSuccess={() => void handleMoveOutSuccess()}
      />

      <LeaseReportIssueModal
        open={reportIssueOpen}
        recipientLabel="your property manager"
        leaseLabel={pipelineRow ? `${pipelineRow.residentName || "You"} — ${pipelineRow.unit || "unit"}` : ""}
        busy={reportIssueBusy}
        onClose={() => {
          if (reportIssueBusy) return;
          setReportIssueOpen(false);
        }}
        onSubmit={(subject, message) => void onSubmitReportIssue(subject, message)}
      />

      <ManagerPortalPageShell
        title="Lease"
        titleAside={
          <>
            <Button
              type="button"
              variant="outline"
              className="shrink-0 rounded-full"
              onClick={() => setShowMoveOutModal(true)}
            >
              Renew or extend lease
            </Button>
            <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={onDownloadLeasePackage}>
              Download PDF
            </Button>
            <Button
              type="button"
              variant="outline"
              className="shrink-0 rounded-full"
              onClick={() => uploadRef.current?.click()}
              disabled={uploadingPdf}
            >
              {uploadingPdf ? "Uploading PDF..." : "Upload signed PDF"}
            </Button>
            <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={onSendToManager}>
              Send to manager
            </Button>
            <Button type="button" variant="primary" className="shrink-0 rounded-full" onClick={() => onSignLease()}>
              {pipelineRow?.residentSignature ? "Resident signed" : "Sign lease"}
            </Button>
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
              <Card className="glass-card mt-4 border-[color-mix(in_srgb,var(--status-confirmed-fg)_25%,transparent)] p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-[var(--status-confirmed-fg)]">Signature status</p>
                <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <p className="font-semibold text-foreground">Manager</p>
                    <p className={pipelineRow.managerSignature ? "text-[var(--status-confirmed-fg)]" : "text-[var(--status-pending-fg)]"}>
                      {pipelineRow.managerSignature
                        ? `Signed by ${pipelineRow.managerSignature.name} · ${safeFormatDateTime(pipelineRow.managerSignature.signedAtIso)}`
                        : "Pending signature"}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Resident</p>
                    <p className={pipelineRow.residentSignature ? "text-[var(--status-confirmed-fg)]" : "text-[var(--status-pending-fg)]"}>
                      {pipelineRow.residentSignature
                        ? `Signed by ${pipelineRow.residentSignature.name} · ${safeFormatDateTime(pipelineRow.residentSignature.signedAtIso)}`
                        : "Pending signature"}
                    </p>
                  </div>
                </div>
              </Card>
            ) : null}
            {pipelineRow.managerUploadedPdf?.dataUrl && pipelineRow.status === "Resident Signature Pending" ? (
              <Card className="glass-card mt-4 border-[color-mix(in_srgb,var(--status-approved-fg)_25%,transparent)] p-4 text-sm text-[var(--status-approved-fg)]">
                Sign in the portal to append an electronic signature page, or upload a manually signed PDF if you prefer.
              </Card>
            ) : null}
          </div>
        ) : null}

        {leaseVisibleToResident && pipelineRow && email ? (
          <Card className="glass-card border-border p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">Have a question or issue with this lease?</p>
            <div className="mt-3">
              <Button type="button" variant="outline" className="rounded-full" onClick={() => setReportIssueOpen(true)}>
                Report issue
              </Button>
            </div>
          </Card>
        ) : null}

        {upgradeBreakdown ? (
          <Card className="glass-card mt-6 border-border p-5">
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
          </Card>
        ) : null}
      </ManagerPortalPageShell>
    </>
  );
}
