"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  demoResidentLeaseChecklist,
  demoResidentLeaseHub,
  demoResidentLeaseVersions,
} from "@/data/demo-portal";
import { LeaseDocumentPreview } from "@/components/portal/lease-document-preview";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import {
  shortToLongTermUpgradeBreakdown,
} from "@/lib/household-charges";
import {
  buildAiGeneratedLeaseHtml,
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
  residentRequestEdits,
  residentSignLease,
  syncLeasePipelineFromServer,
  type LeasePipelineRow,
} from "@/lib/lease-pipeline-storage";
import { paymentAtSigningPriceLabel } from "@/lib/rental-application/listing-fees-display";
import {
  addUploadedOwnLease,
  clearUploadedOwnLease,
  readUploadedOwnLeases,
  removeUploadedOwnLease,
  type UploadedOwnLease,
} from "@/lib/resident-lease-upload";
import { usePortalSession } from "@/hooks/use-portal-session";

type ChecklistRow = { id: string; label: string; done: boolean };

function LeaseSigningModal({
  row,
  residentName,
  onSign,
  onClose,
}: {
  row: LeasePipelineRow;
  residentName: string;
  onSign: (signatureName: string) => void;
  onClose: () => void;
}) {
  const [sigName, setSigName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [signed, setSigned] = useState(false);
  const now = new Date().toLocaleString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const canSign = sigName.trim().length >= 2 && agreed;

  const handleSign = () => {
    if (!canSign) return;
    setSigned(true);
    setTimeout(() => onSign(sigName.trim()), 800);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-900/60 p-3 sm:items-center sm:p-6">
      <button type="button" className="absolute inset-0 cursor-default" onClick={onClose} aria-label="Close" />
      <div className="relative z-10 flex max-h-[96vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="shrink-0 border-b border-slate-100 px-6 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-slate-900">Sign lease agreement</h2>
              <p className="mt-0.5 text-sm text-slate-600">
                {row.unit} · {row.residentName}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg text-slate-600 hover:bg-slate-200"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {(row.generatedHtml || row.managerUploadedPdf?.dataUrl) ? (
            <div className="border-b border-slate-100">
              {row.managerUploadedPdf?.dataUrl ? (
                <iframe
                  title="Lease document"
                  src={row.managerUploadedPdf.dataUrl}
                  className="h-[min(40vh,360px)] w-full bg-white"
                />
              ) : (
                <iframe
                  title="Lease document"
                  srcDoc={row.generatedHtml!}
                  sandbox="allow-same-origin"
                  className="h-[min(40vh,360px)] w-full bg-white"
                />
              )}
            </div>
          ) : null}

          <div className="space-y-5 px-6 py-6">
            {signed ? (
              <div className="rounded-2xl border border-emerald-200/90 bg-emerald-50/90 px-5 py-6 text-center">
                <p className="text-2xl font-black text-emerald-700">✓ Signed</p>
                <p className="mt-2 text-sm text-slate-700">
                  Your electronic signature has been recorded. Closing this window…
                </p>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Your full legal name
                  </label>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Type exactly as it should appear on the signed document.
                  </p>
                  <input
                    type="text"
                    value={sigName}
                    onChange={(e) => setSigName(e.target.value)}
                    placeholder={residentName || "Full legal name"}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                  />
                  {sigName.trim().length >= 2 ? (
                    <p
                      className="mt-3 text-center text-2xl text-slate-800"
                      style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic" }}
                    >
                      {sigName}
                    </p>
                  ) : null}
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-xs text-slate-600">
                  <p className="font-semibold text-slate-700">Signing date & time</p>
                  <p className="mt-0.5">{now}</p>
                </div>

                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-primary"
                  />
                  <span>
                    I agree to sign this Residential Room Rental Agreement electronically. I understand that my typed name above constitutes
                    my legally binding electronic signature, equivalent to a handwritten signature.
                  </span>
                </label>
              </>
            )}
          </div>
        </div>

        {!signed ? (
          <div className="shrink-0 border-t border-slate-100 px-6 py-4">
            <div className="flex flex-wrap justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-full" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="button"
                className="rounded-full"
                disabled={!canSign}
                onClick={handleSign}
              >
                Sign lease
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const MAX_LEASE_PDF_BYTES = 12 * 1024 * 1024;

export function ResidentLeasePanel() {
  const { showToast } = useAppUi();
  const session = usePortalSession();
  const [checklist, setChecklist] = useState<ChecklistRow[]>(() =>
    demoResidentLeaseChecklist.map((c) => ({ id: c.id, label: c.label, done: c.done })),
  );
  const [aiPreviewUrl, setAiPreviewUrl] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const aiBlobUrlRef = useRef<string | null>(null);
  const [pipelineTick, setPipelineTick] = useState(0);
  const [editRequestDraft, setEditRequestDraft] = useState("");
  const [showSigningModal, setShowSigningModal] = useState(false);
  const [uploadTick, setUploadTick] = useState(0);
  const email = session.email?.trim() || null;
  const ownLeases = useMemo(() => {
    void uploadTick;
    return email ? readUploadedOwnLeases(email) : [];
  }, [email, uploadTick]);

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

  useEffect(() => {
    return () => {
      if (aiBlobUrlRef.current) {
        URL.revokeObjectURL(aiBlobUrlRef.current);
        aiBlobUrlRef.current = null;
      }
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

  const summaryFromApp = (() => {
    const a = leaseCtx.application;
    const sub = leaseCtx.submission;
    const room = leaseCtx.leasedRoom ?? leaseCtx.listingProperty;
    const hasAny = Boolean(a.propertyId || a.roomChoice1 || a.fullLegalName);
    if (!hasAny && !room) {
      return {
        moveIn: demoResidentLeaseHub.moveIn,
        termLabel: demoResidentLeaseHub.termLabel,
        deposit: demoResidentLeaseHub.deposit,
        paymentAtSigning: demoResidentLeaseHub.paymentAtSigning,
        pdfName: demoResidentLeaseHub.pdfName,
        subtitle: "Save a rental application draft (Apply flow) to fill these from your data.",
      };
    }
    return {
      moveIn: a.leaseStart?.trim() || "—",
      termLabel: [a.leaseTerm, a.leaseEnd && a.leaseTerm !== "Month-to-Month" ? `through ${a.leaseEnd}` : ""]
        .filter(Boolean)
        .join(" · ") || "—",
      deposit: sub?.securityDeposit?.trim() || "—",
      paymentAtSigning: sub ? paymentAtSigningPriceLabel(sub) : "—",
      pdfName: room ? `${room.buildingName} · ${room.unitLabel}` : "Your selected listing",
      subtitle: "Pulled from your saved application and published listing fees where available.",
    };
  })();

  const leaseLocked = Boolean(pipelineRow?.bucket === "signed");
  const leaseVisibleToResident = Boolean(pipelineRow && (pipelineRow.bucket === "resident" || pipelineRow.bucket === "signed"));

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

  const canSignElectronically = Boolean(pipelineRow?.bucket === "resident" && !pipelineRow.residentSignature && !leaseLocked);
  /** Request edits, upload your copy, extension — only after manager sends lease to resident. */
  const residentLeaseActions = Boolean(pipelineRow?.bucket === "resident" && !leaseLocked);

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
      if (ownLeases[0]) {
        downloadLeaseFromRow(pipelineRow);
        showToast("PDF download started.");
        return;
      }
      showToast("Ask your manager to generate the lease, or upload your PDF below.");
      return;
    }
    onDownloadAiLease();
  }, [pipelineRow, ownLeases, onDownloadAiLease, showToast]);

  const onSignLease = () => {
    if (!email || leaseLocked) return;
    if (pipelineRow?.bucket !== "resident") {
      showToast("Signing opens when your manager sends the lease to you (With resident stage).");
      return;
    }
    setShowSigningModal(true);
  };

  const handleModalSign = (signatureName: string) => {
    if (!email) return;
    if (residentSignLease(email, signatureName)) {
      setShowSigningModal(false);
      showToast(hasBothLeaseSignatures({ ...pipelineRow, residentSignature: { role: "resident", name: signatureName, signedAtIso: new Date().toISOString() } }) ? "Lease fully signed." : "Lease signed. Your manager still needs to sign.");
      setPipelineTick((t) => t + 1);
    } else {
      showToast("Could not sign — try again.");
    }
  };

  const onSubmitEditRequest = () => {
    if (!email || !editRequestDraft.trim()) {
      showToast("Describe what should change.");
      return;
    }
    if (residentRequestEdits(email, editRequestDraft.trim())) {
      showToast("Edit request sent to your manager.");
      setEditRequestDraft("");
      setPipelineTick((t) => t + 1);
    } else showToast("Could not send request.");
  };

  const buildPreviewBlobUrl = useCallback(() => {
    const blob = new Blob([buildAiGeneratedLeaseHtml(leaseCtx)], { type: "text/html;charset=utf-8" });
    if (aiBlobUrlRef.current) URL.revokeObjectURL(aiBlobUrlRef.current);
    const u = URL.createObjectURL(blob);
    aiBlobUrlRef.current = u;
    setAiPreviewUrl(u);
  }, [leaseCtx]);

  const onPickOwnLeasePdf = async (files: FileList | null) => {
    if (!email) {
      showToast("Sign in to upload your lease.");
      return;
    }
    const selected = Array.from(files ?? []);
    if (!selected.length) return;
    const validFiles = selected.filter((file) => file.type === "application/pdf" && file.size <= MAX_LEASE_PDF_BYTES);
    if (!validFiles.length) {
      showToast("Please choose PDF files under the size limit.");
      return;
    }
    const hadInvalid = validFiles.length !== selected.length;
    let savedCount = 0;
    await Promise.all(
      validFiles.map(
        (file) =>
          new Promise<void>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = reader.result as string;
              addUploadedOwnLease(email, {
                dataUrl,
                fileName: file.name,
                uploadedAt: new Date().toISOString(),
              });
              savedCount += 1;
              resolve();
            };
            reader.onerror = () => resolve();
            reader.readAsDataURL(file);
          }),
      ),
    );
    if (savedCount > 0) {
      setUploadTick((tick) => tick + 1);
      window.dispatchEvent(new Event(LEASE_PIPELINE_EVENT));
      showToast(
        hadInvalid
          ? `${savedCount} PDF${savedCount === 1 ? "" : "s"} uploaded. Some files were skipped.`
          : `${savedCount} PDF${savedCount === 1 ? "" : "s"} uploaded.`,
      );
    } else {
      showToast("Could not read those files.");
    }
    if (uploadInputRef.current) uploadInputRef.current.value = "";
  };

  const onRemoveOwnLease = (upload: UploadedOwnLease) => {
    if (!email) return;
    removeUploadedOwnLease(email, upload.id);
    setUploadTick((tick) => tick + 1);
    showToast(`Removed ${upload.fileName}.`);
  };

  const onRemoveAllOwnLeases = () => {
    if (!email) return;
    clearUploadedOwnLease(email);
    setUploadTick((tick) => tick + 1);
    showToast("Removed all uploaded PDFs.");
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
    {showSigningModal && pipelineRow ? (
      <LeaseSigningModal
        row={pipelineRow}
        residentName={leaseCtx.application?.fullLegalName ?? pipelineRow.residentName ?? ""}
        onSign={handleModalSign}
        onClose={() => setShowSigningModal(false)}
      />
    ) : null}
    <ManagerPortalPageShell
      title="Lease"
      titleAside={
        <>
          {residentLeaseActions ? (
            <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={() => showToast("Extension request sent.")}>
              Request extension
            </Button>
          ) : null}
          <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={onDownloadLeasePackage}>
            Download PDF
          </Button>
          <Button
            type="button"
            variant="primary"
            className="shrink-0 rounded-full"
            disabled={!canSignElectronically}
            onClick={() => onSignLease()}
          >
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
          <p className="mt-1 text-sm text-slate-600">Send a note to your property manager. Your lease moves back to manager review.</p>
          <textarea
            rows={3}
            value={editRequestDraft}
            onChange={(e) => setEditRequestDraft(e.target.value)}
            placeholder="What needs to change in the lease?"
            className="mt-3 w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800"
          />
          <Button type="button" variant="outline" className="mt-3 rounded-full" onClick={onSubmitEditRequest}>
            Send edit request
          </Button>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-slate-200/80 p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Term & move-in</p>
          <p className="mt-1 text-[11px] text-slate-500">
            {summaryFromApp.subtitle}{" "}
            <Link href="/rent/apply" className="font-medium text-primary underline underline-offset-2">
              Rental application
            </Link>
          </p>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Move-in</dt>
              <dd className="font-semibold text-slate-900">{summaryFromApp.moveIn}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Lease term</dt>
              <dd className="text-right font-semibold text-slate-900">{summaryFromApp.termLabel}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Security deposit</dt>
              <dd className="font-semibold text-slate-900">{summaryFromApp.deposit}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Payment at signing</dt>
              <dd className="text-right font-semibold text-slate-900">{summaryFromApp.paymentAtSigning}</dd>
            </div>
          </dl>
        </Card>

        <Card className="flex min-h-[260px] flex-col border-dashed border-slate-200/90 bg-slate-50/50 p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Documents</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">AI-generated lease</p>
          <p className="mt-1 text-sm text-slate-600">
            Built from your saved rental application (`axis:rental-application:draft:v1`) plus listing and manager submission when
            available. Covers parties, premises, term, rent, deposit, utilities, shared spaces, pets, maintenance, access, default, notices,
            governing law, disclosures, application summary, exhibits, and signature blocks — aligned with a standard room rental agreement.
          </p>
          {residentLeaseActions ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="rounded-full text-xs" onClick={buildPreviewBlobUrl}>
                Preview AI lease
              </Button>
              <Button type="button" variant="outline" className="rounded-full text-xs" onClick={onDownloadLeasePackage}>
                Download lease
              </Button>
            </div>
          ) : (
            <p className="mt-3 text-xs text-slate-600">
              Preview and package downloads for your official lease unlock when your manager sends it to you (<strong>With resident</strong>
              ).
            </p>
          )}

          <p className="mt-6 text-sm font-semibold text-slate-900">Your own lease (PDF)</p>
          <p className="mt-1 text-sm text-slate-600">Upload a countersigned or attorney-provided PDF. Stored locally for this browser session.</p>
          {residentLeaseActions ? (
            <>
              <input
                ref={uploadInputRef}
                type="file"
                accept="application/pdf"
                multiple
                className="sr-only"
                id="resident-upload-own-lease"
                onChange={(e) => void onPickOwnLeasePdf(e.target.files)}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <label
                  htmlFor="resident-upload-own-lease"
                  className="inline-flex cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                >
                  Upload PDF
                </label>
                {ownLeases.length > 0 ? (
                  <Button type="button" variant="outline" className="rounded-full text-xs" onClick={onRemoveAllOwnLeases}>
                    Remove all uploads
                  </Button>
                ) : null}
              </div>
              {ownLeases.length ? (
                <ul className="mt-3 space-y-2">
                  {ownLeases.map((upload) => (
                    <li key={upload.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-800">{upload.fileName}</p>
                        <p className="text-slate-500">{new Date(upload.uploadedAt).toLocaleString()}</p>
                      </div>
                      <Button type="button" variant="outline" className="rounded-full text-[11px]" onClick={() => onRemoveOwnLease(upload)}>
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <p className="mt-3 text-xs text-slate-600">Upload opens when your manager has sent the lease to you for review and signature.</p>
          )}
        </Card>
      </div>

      {residentLeaseActions && ((aiPreviewUrl && !pipelineRow?.generatedHtml) || ownLeases.length > 0) ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {aiPreviewUrl && !pipelineRow?.generatedHtml ? (
            <Card className="overflow-hidden border-slate-200/80 p-0">
              <p className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                AI lease preview (from your application draft)
              </p>
              <iframe title="AI-generated lease preview" src={aiPreviewUrl} className="h-[min(520px,55vh)] w-full bg-white" />
            </Card>
          ) : null}
          {ownLeases.map((upload) => (
            <Card key={upload.id} className="overflow-hidden border-slate-200/80 p-0">
              <p className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Uploaded PDF · {upload.fileName}
              </p>
              <iframe title={`Uploaded lease PDF ${upload.fileName}`} src={upload.dataUrl} className="h-[min(520px,55vh)] w-full bg-slate-100" />
            </Card>
          ))}
        </div>
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

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="border-slate-200/80 p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Version history</p>
          <ul className="mt-3 space-y-2 text-sm">
            {demoResidentLeaseVersions.length === 0 ? (
              <li className="text-sm text-slate-500">No prior versions on file — use AI download / upload above.</li>
            ) : (
              demoResidentLeaseVersions.map((v) => (
                <li key={v.id} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
                  <p className="font-medium text-slate-900">{v.label}</p>
                  <p className="mt-0.5 text-xs text-slate-600">{v.note}</p>
                </li>
              ))
            )}
          </ul>
        </Card>

        <Card className="border-slate-200/80 p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Prerequisite checklist</p>
          <ul className="mt-3 space-y-2">
            {checklist.map((item) => (
              <li key={item.id}>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary"
                    checked={item.done}
                    onChange={() => setChecklist((rows) => rows.map((r) => (r.id === item.id ? { ...r, done: !r.done } : r)))}
                  />
                  <span>{item.label}</span>
                </label>
              </li>
            ))}
          </ul>
          {residentLeaseActions ? (
            <Button type="button" className="mt-4 rounded-full" variant="outline" onClick={() => showToast("Comment sent to manager.")}>
              Add comment for manager
            </Button>
          ) : (
            <p className="mt-4 text-xs text-slate-500">Comments to your manager are available once the lease is with you and the required signing charges are paid.</p>
          )}
        </Card>
      </div>
    </ManagerPortalPageShell>
    </>
  );
}
