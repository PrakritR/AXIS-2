"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { LeaseDocumentPreview } from "@/components/portal/lease-document-preview";
import { LeaseSigningModal } from "@/components/portal/lease-signing-modal";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { formatPacificDate, safeFormatDateTime } from "@/lib/pacific-time";
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
  generateLeaseHtmlForRow,
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

type AvailabilityResult =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available"; direction: "extend" | "decrease" | "same" }
  | { status: "unavailable"; direction: "extend"; reason: string; nextAvailableDate?: string | null }
  | { status: "error"; message: string };

function MoveOutDateModal({
  open,
  onClose,
  currentEnd,
  leaseStart,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  currentEnd: string;
  leaseStart: string;
  onSuccess: () => void;
}) {
  const { showToast } = useAppUi();
  const [selectedDate, setSelectedDate] = useState("");
  const [availability, setAvailability] = useState<AvailabilityResult>({ status: "idle" });
  const [submitting, setSubmitting] = useState(false);
  const checkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!open) {
      queueMicrotask(() => {
        setSelectedDate("");
        setAvailability({ status: "idle" });
        setSubmitting(false);
      });
    }
  }, [open]);

  const direction = selectedDate
    ? selectedDate < currentEnd
      ? "decrease"
      : selectedDate > currentEnd
        ? "extend"
        : "same"
    : null;

  // Debounced availability check whenever selectedDate changes
  useEffect(() => {
    if (checkTimerRef.current) clearTimeout(checkTimerRef.current);
    if (!selectedDate || selectedDate === currentEnd) {
      queueMicrotask(() => setAvailability({ status: "idle" }));
      return;
    }
    if (direction === "decrease") {
      // No server check needed for early termination
      queueMicrotask(() => setAvailability({ status: "available", direction: "decrease" }));
      return;
    }
    queueMicrotask(() => setAvailability({ status: "checking" }));
    checkTimerRef.current = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch("/api/resident/check-move-out-availability", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ newLeaseEnd: selectedDate }),
          });
          const json = await res.json() as {
            available?: boolean;
            direction?: string;
            reason?: string;
            nextAvailableDate?: string | null;
            error?: string;
          };
          if (!res.ok || json.error) {
            setAvailability({ status: "error", message: json.error ?? "Could not check availability." });
            return;
          }
          if (json.available) {
            setAvailability({ status: "available", direction: "extend" });
          } else {
            setAvailability({
              status: "unavailable",
              direction: "extend",
              reason: json.reason ?? "This room is not available for the selected period.",
              nextAvailableDate: json.nextAvailableDate ?? null,
            });
          }
        } catch {
          setAvailability({ status: "error", message: "Network error — please try again." });
        }
      })();
    }, 600);
    return () => { if (checkTimerRef.current) clearTimeout(checkTimerRef.current); };
  }, [selectedDate, currentEnd, direction]);

  const canConfirm =
    Boolean(selectedDate) &&
    selectedDate !== currentEnd &&
    !submitting &&
    availability.status !== "checking" &&
    availability.status !== "unavailable";

  const handleConfirm = async () => {
    if (!selectedDate || !canConfirm) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/resident/extend-lease", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newLeaseEnd: selectedDate }),
      });
      const json = await res.json() as { ok?: boolean; error?: string; direction?: string };
      if (!res.ok || !json.ok) {
        showToast(json.error ?? "Failed to update move-out date.");
      } else {
        onClose();
        onSuccess();
        const msg =
          json.direction === "decrease"
            ? "Move-out date moved earlier. Your lease needs to be re-signed."
            : "Move-out date extended. Your lease needs to be re-signed.";
        showToast(msg);
      }
    } catch {
      showToast("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const currentEndFormatted = currentEnd
    ? formatPacificDate(currentEnd, { year: "numeric", month: "long", day: "numeric" })
    : "—";

  const minDate = leaseStart || undefined;

  return (
    <Modal open={open} title="Change move-out date" onClose={onClose} panelClassName="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
      {/* Current date info */}
      <div className="mb-5 flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm">
        <span className="text-slate-500">Current move-out date</span>
        <span className="ml-auto font-semibold text-slate-900">{currentEndFormatted}</span>
      </div>

      {/* Date picker */}
      <div className="mb-4">
        <label className="mb-1.5 block text-sm font-semibold text-slate-700">New move-out date</label>
        <input
          type="date"
          value={selectedDate}
          min={minDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
      </div>

      {/* Dynamic status area */}
      {selectedDate && selectedDate !== currentEnd && (
        <div className="mb-5 space-y-2">
          {/* Early termination fee warning */}
          {direction === "decrease" && (
            <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
              <div>
                <p className="font-semibold">Early termination</p>
                <p className="mt-0.5 text-amber-800">
                  Moving out earlier than your lease end date may result in an early termination fee at your property manager&apos;s discretion. Contact your manager to confirm any charges.
                </p>
              </div>
            </div>
          )}

          {/* Availability status for extensions */}
          {direction === "extend" && (
            <>
              {availability.status === "checking" && (
                <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <svg className="h-4 w-4 animate-spin text-slate-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Checking room availability…
                </div>
              )}
              {availability.status === "available" && (
                <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  <svg className="h-4 w-4 shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  Room is available through the new date.
                </div>
              )}
              {availability.status === "unavailable" && (
                <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                  <svg className="mt-0.5 h-4 w-4 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                  <div>
                    <p className="font-semibold">Room not available</p>
                    <p className="mt-0.5 text-red-800">{availability.reason}</p>
                    {availability.nextAvailableDate && (
                      <p className="mt-1 text-red-700">
                        Next available:{" "}
                        <span className="font-medium">
                          {formatPacificDate(availability.nextAvailableDate, {
                            year: "numeric", month: "long", day: "numeric",
                          })}
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              )}
              {availability.status === "error" && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  {availability.status === "error" ? (availability as { status: "error"; message: string }).message : ""}
                </div>
              )}
            </>
          )}

          {/* Re-signing notice */}
          <p className="px-1 text-xs text-slate-500">
            Changing the move-out date will reset your lease for re-signing by both you and your property manager.
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2.5">
        <Button type="button" variant="outline" className="flex-1 rounded-full" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          className="flex-1 rounded-full"
          disabled={!canConfirm}
          onClick={() => void handleConfirm()}
        >
          {submitting
            ? "Saving…"
            : direction === "decrease"
              ? "Move out earlier"
              : "Extend stay"}
        </Button>
      </div>
    </Modal>
  );
}

export function ResidentLeasePanel() {
  const { showToast } = useAppUi();
  const session = usePortalSession();
  const uploadRef = useRef<HTMLInputElement>(null);
  const [pipelineTick, setPipelineTick] = useState(0);
  const [editRequestDraft, setEditRequestDraft] = useState("");
  const [showSigningModal, setShowSigningModal] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [showMoveOutModal, setShowMoveOutModal] = useState(false);
  const [residentAxisId, setResidentAxisId] = useState("");
  const email = session.email?.trim() || null;

  useEffect(() => {
    if (!session.userId) return;
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

  const leaseLocked = Boolean(pipelineRow && hasBothLeaseSignatures(pipelineRow));
  const leaseVisibleToResident = residentCanViewLeaseRow(pipelineRow) && leaseAuthorized;
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
  const canRequestMoveOutChange = leaseLocked;
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

  const handleMoveOutSuccess = useCallback(async () => {
    await syncLeasePipelineFromServer();
    if (pipelineRow?.id) generateLeaseHtmlForRow(pipelineRow.id);
    setPipelineTick((t) => t + 1);
  }, [pipelineRow]);

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

      {/* Move-out date change modal */}
      <MoveOutDateModal
        open={showMoveOutModal}
        onClose={() => setShowMoveOutModal(false)}
        currentEnd={pipelineRow?.application?.leaseEnd ?? ""}
        leaseStart={pipelineRow?.application?.leaseStart ?? ""}
        onSuccess={() => void handleMoveOutSuccess()}
      />

      <ManagerPortalPageShell
        title="Lease"
        titleAside={
          <>
            {canRequestMoveOutChange ? (
              <Button
                type="button"
                variant="outline"
                className="shrink-0 rounded-full"
                onClick={() => setShowMoveOutModal(true)}
              >
                Change move-out date
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
                        ? `Signed by ${pipelineRow.managerSignature.name} · ${safeFormatDateTime(pipelineRow.managerSignature.signedAtIso)}`
                        : "Pending signature"}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">Resident</p>
                    <p className={pipelineRow.residentSignature ? "text-emerald-800" : "text-amber-700"}>
                      {pipelineRow.residentSignature
                        ? `Signed by ${pipelineRow.residentSignature.name} · ${safeFormatDateTime(pipelineRow.residentSignature.signedAtIso)}`
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

        {leaseVisibleToResident && pipelineRow && email ? (
          <Card className="border-slate-200/80 p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Messages</p>
            <textarea
              rows={3}
              value={editRequestDraft}
              onChange={(e) => setEditRequestDraft(e.target.value)}
              placeholder={residentLeaseActions ? "Ask for changes, or send a message to your manager…" : "Send a message to your manager…"}
              className="mt-3 w-full resize-none rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
            <div className="mt-2.5">
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => {
                  if (!editRequestDraft.trim()) { showToast("Enter a message first."); return; }
                  if (!pipelineRow) return;
                  if (appendLeaseThreadMessage(pipelineRow.id, "resident", editRequestDraft.trim())) {
                    showToast("Message sent.");
                    setEditRequestDraft("");
                    setPipelineTick((t) => t + 1);
                  } else showToast("Could not send message.");
                }}
              >
                Send message
              </Button>
            </div>
            {pipelineRow.thread?.length ? (
              <>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">History</p>
                <ul className="mt-2 space-y-2">
                  {pipelineRow.thread.map((m) => (
                    <li
                      key={m.id}
                      className={`rounded-xl px-3 py-2 text-sm ${m.role === "resident" ? "border border-blue-100 bg-blue-50" : "border border-slate-100 bg-slate-50"}`}
                    >
                      <span className="font-semibold text-slate-800">{m.role === "resident" ? "You" : "Manager"}</span>
                      <span className="ml-1.5 text-xs text-slate-400">{safeFormatDateTime(m.at)}</span>
                      <p className="mt-1 whitespace-pre-wrap text-slate-700">{m.body}</p>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
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
