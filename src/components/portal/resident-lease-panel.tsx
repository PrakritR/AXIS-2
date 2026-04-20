"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  demoResidentLeaseChecklist,
  demoResidentLeaseHub,
  demoResidentLeaseVersions,
} from "@/data/demo-portal";
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
} from "@/lib/generated-lease";
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
    return () => {
      if (aiBlobUrlRef.current) {
        URL.revokeObjectURL(aiBlobUrlRef.current);
        aiBlobUrlRef.current = null;
      }
    };
  }, []);

  const leaseCtx = gatherLeaseGenerationContext();

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

  const buildPreviewBlobUrl = useCallback(() => {
    const ctx = gatherLeaseGenerationContext();
    const blob = new Blob([buildAiGeneratedLeaseHtml(ctx)], { type: "text/html;charset=utf-8" });
    if (aiBlobUrlRef.current) URL.revokeObjectURL(aiBlobUrlRef.current);
    const u = URL.createObjectURL(blob);
    aiBlobUrlRef.current = u;
    setAiPreviewUrl(u);
  }, []);

  const onDownloadAiLease = () => {
    const ctx = gatherLeaseGenerationContext();
    downloadAiGeneratedLeaseHtml(ctx);
    showToast("Downloaded AI lease (HTML). Open the file and use Print → Save as PDF if you need a PDF.");
  };

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
      showToast("Your lease PDF is saved in this browser (demo).");
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
          <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={() => showToast("Request extension (demo).")}>
            Request extension
          </Button>
          <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={onDownloadAiLease}>
            Download AI lease
          </Button>
          <Button
            type="button"
            variant="primary"
            className="shrink-0 rounded-full"
            disabled={leaseLocked}
            onClick={() => (leaseLocked ? null : showToast("Sign lease (demo)."))}
          >
            Sign lease
          </Button>
        </>
      }
    >
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
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="rounded-full text-xs" onClick={buildPreviewBlobUrl}>
              Preview AI lease
            </Button>
            <Button type="button" variant="outline" className="rounded-full text-xs" onClick={onDownloadAiLease}>
              Download AI lease
            </Button>
          </div>

          <p className="mt-6 text-sm font-semibold text-slate-900">Your own lease (PDF)</p>
          <p className="mt-1 text-sm text-slate-600">Upload a countersigned or attorney-provided PDF. Stored locally for this account in the demo.</p>
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
        </Card>
      </div>

      {(aiPreviewUrl || ownLease) && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {aiPreviewUrl ? (
            <Card className="overflow-hidden border-slate-200/80 p-0">
              <p className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">AI lease preview</p>
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
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="border-slate-200/80 p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Version history</p>
          <ul className="mt-3 space-y-2 text-sm">
            {demoResidentLeaseVersions.length === 0 ? (
              <li className="text-sm text-slate-500">No prior versions in demo data — use AI download / upload above.</li>
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
          <Button type="button" className="mt-4 rounded-full" variant="outline" onClick={() => showToast("Comment sent to manager (demo).")}>
            Add comment for manager
          </Button>
        </Card>
      </div>
    </ManagerPortalPageShell>
  );
}
