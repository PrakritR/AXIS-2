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
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  HOUSEHOLD_CHARGES_EVENT,
  linkHouseholdChargesToResidentUser,
  residentLeaseBlockedReasons,
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
  residentRequestEdits,
  residentSignLease,
} from "@/lib/lease-pipeline-storage";
import { paymentAtSigningPriceLabel } from "@/lib/rental-application/listing-fees-display";
import {
  clearUploadedOwnLease,
  readUploadedOwnLease,
  saveUploadedOwnLease,
  type UploadedOwnLease,
} from "@/lib/resident-lease-upload";

type ChecklistRow = { id: string; label: string; done: boolean };

const MAX_LEASE_PDF_BYTES = 12 * 1024 * 1024;

export function ResidentLeasePanel() {
  const { showToast } = useAppUi();
  const [checklist, setChecklist] = useState<ChecklistRow[]>(() =>
    demoResidentLeaseChecklist.map((c) => ({ id: c.id, label: c.label, done: c.done })),
  );
  const [leaseBlockers, setLeaseBlockers] = useState<string[]>([]);
  const [email, setEmail] = useState<string | null>(null);
  const [ownLease, setOwnLease] = useState<UploadedOwnLease | null>(null);
  const [aiPreviewUrl, setAiPreviewUrl] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const aiBlobUrlRef = useRef<string | null>(null);
  const [pipelineTick, setPipelineTick] = useState(0);
  const [editRequestDraft, setEditRequestDraft] = useState("");

  const refreshLeaseGate = useCallback(() => {
    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const em = user?.email?.trim();
        if (!em || !user?.id) {
          setLeaseBlockers([]);
          setEmail(null);
          setOwnLease(null);
          return;
        }
        linkHouseholdChargesToResidentUser(em, user.id);
        setLeaseBlockers(residentLeaseBlockedReasons(em, user.id));
        setEmail(em);
        setOwnLease(readUploadedOwnLease(em));
      } catch {
        setLeaseBlockers([]);
        setEmail(null);
        setOwnLease(null);
      }
    })();
  }, []);

  useEffect(() => {
    refreshLeaseGate();
  }, [refreshLeaseGate]);

  useEffect(() => {
    const on = () => refreshLeaseGate();
    window.addEventListener(HOUSEHOLD_CHARGES_EVENT, on);
    return () => window.removeEventListener(HOUSEHOLD_CHARGES_EVENT, on);
  }, [refreshLeaseGate]);

  useEffect(() => {
    const on = () => setPipelineTick((t) => t + 1);
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

  const leaseLocked = leaseBlockers.length > 0;

  const canSignElectronically = Boolean(pipelineRow?.bucket === "resident" && !leaseLocked);
  /** Request edits, upload your copy, extension — only after manager sends lease to resident. */
  const residentLeaseActions = Boolean(pipelineRow?.bucket === "resident");

  const onDownloadAiLease = useCallback(() => {
    downloadAiGeneratedLeaseHtml(leaseCtx);
    showToast("Downloaded AI lease (HTML). Open the file and use Print → Save as PDF if you need a PDF.");
  }, [leaseCtx, showToast]);

  const onDownloadLeasePackage = useCallback(() => {
    if (pipelineRow) {
      if (pipelineRow.generatedHtml || pipelineRow.managerUploadedPdf) {
        downloadLeaseFromRow(pipelineRow);
        showToast("Download started.");
        return;
      }
      if (ownLease) {
        downloadLeaseFromRow(pipelineRow);
        showToast("Download started.");
        return;
      }
      showToast("Ask your manager to generate the lease, or upload your PDF below.");
      return;
    }
    onDownloadAiLease();
  }, [pipelineRow, ownLease, onDownloadAiLease, showToast]);

  const onSignLease = () => {
    if (!email || leaseLocked) return;
    if (residentSignLease(email)) {
      showToast("Lease recorded as signed.");
      setPipelineTick((t) => t + 1);
    } else {
      showToast(
        pipelineRow?.bucket === "resident"
          ? "Could not sign — try again."
          : "Signing opens when your manager sends the lease to you (With resident stage).",
      );
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
    const f = files?.[0];
    if (!f) return;
    if (f.type !== "application/pdf") {
      showToast("Please choose a PDF file.");
      return;
    }
    if (f.size > MAX_LEASE_PDF_BYTES) {
      showToast(`PDF too large (max ${Math.round(MAX_LEASE_PDF_BYTES / 1024 / 1024)} MB).`);
      return;
    }
    if (!email) {
      showToast("Sign in to upload your lease.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const payload: UploadedOwnLease = {
        dataUrl,
        fileName: f.name,
        uploadedAt: new Date().toISOString(),
      };
      saveUploadedOwnLease(email, payload);
      setOwnLease(payload);
      window.dispatchEvent(new Event(LEASE_PIPELINE_EVENT));
      showToast("Your lease PDF is saved in this browser.");
    };
    reader.onerror = () => showToast("Could not read that file.");
    reader.readAsDataURL(f);
    if (uploadInputRef.current) uploadInputRef.current.value = "";
  };

  const onRemoveOwnLease = () => {
    if (!email) return;
    clearUploadedOwnLease(email);
    setOwnLease(null);
    showToast("Removed uploaded lease.");
  };

  return (
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
            Download lease
          </Button>
          <Button
            type="button"
            variant="primary"
            className="shrink-0 rounded-full"
            disabled={leaseLocked || !canSignElectronically}
            onClick={() => onSignLease()}
          >
            Sign lease
          </Button>
        </>
      }
    >
      {pipelineRow && !residentLeaseActions ? (
        <div className="mb-5 rounded-2xl border border-sky-200/90 bg-sky-50/80 px-4 py-3 text-sm text-sky-950">
          <p className="font-semibold">Lease not yet in your signing queue</p>
          <p className="mt-1 text-sky-900/90">
            Current stage: <strong>{pipelineRow.stageLabel}</strong>. Request edits, upload your countersigned PDF, e-sign, and extension
            requests are available only in the <strong>With resident</strong> stage — after your manager sends the lease to you.
          </p>
        </div>
      ) : null}

      {leaseLocked ? (
        <div className="mb-5 rounded-2xl border border-amber-200/90 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">Lease signing is blocked until required payments are confirmed</p>
          <p className="mt-1">
            Your listing set these amounts on the application. Pay via Zelle if your manager enabled it, then they mark each line paid.
          </p>
          <ul className="mt-2 list-inside list-disc">
            {leaseBlockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <Link href="/resident/payments" className="mt-3 inline-block font-semibold text-primary underline underline-offset-2">
            Open Payments
          </Link>
        </div>
      ) : null}

      {pipelineRow ? (
        <div className="mb-6">
          <LeaseDocumentPreview
            className="mt-0"
            row={pipelineRow}
            emptyHint="Your manager will generate or upload your lease here. When it's ready, the full agreement appears in this preview."
          />
        </div>
      ) : null}

      {pipelineRow?.thread?.length ? (
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
                {ownLease ? (
                  <Button type="button" variant="outline" className="rounded-full text-xs" onClick={onRemoveOwnLease}>
                    Remove upload
                  </Button>
                ) : null}
              </div>
              {ownLease ? <p className="mt-2 text-xs text-slate-500">{ownLease.fileName}</p> : null}
            </>
          ) : (
            <p className="mt-3 text-xs text-slate-600">Upload opens when your manager has sent the lease to you for review and signature.</p>
          )}
        </Card>
      </div>

      {residentLeaseActions && ((aiPreviewUrl && !pipelineRow?.generatedHtml) || ownLease) ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {aiPreviewUrl && !pipelineRow?.generatedHtml ? (
            <Card className="overflow-hidden border-slate-200/80 p-0">
              <p className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                AI lease preview (from your application draft)
              </p>
              <iframe title="AI-generated lease preview" src={aiPreviewUrl} className="h-[min(520px,55vh)] w-full bg-white" />
            </Card>
          ) : null}
          {ownLease ? (
            <Card className="overflow-hidden border-slate-200/80 p-0">
              <p className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Your uploaded PDF</p>
              <iframe title="Uploaded lease PDF" src={ownLease.dataUrl} className="h-[min(520px,55vh)] w-full bg-slate-100" />
            </Card>
          ) : null}
        </div>
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
            <p className="mt-4 text-xs text-slate-500">Comments to your manager are available once the lease is with you (With resident).</p>
          )}
        </Card>
      </div>
    </ManagerPortalPageShell>
  );
}
