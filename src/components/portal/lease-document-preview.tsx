"use client";

import { useMemo } from "react";
import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";
import type { RentalWizardFormState } from "@/lib/rental-application/types";
import { buildAiGeneratedLeaseHtml, leaseContextFromApplication } from "@/lib/generated-lease";

type Props = {
  row: LeasePipelineRow;
  /** Shown when there is no PDF and no generated HTML */
  emptyHint?: string;
  className?: string;
};

function draftHtmlFromApplication(application: Partial<RentalWizardFormState> | undefined): string | null {
  if (!application || !Object.keys(application).length) return null;
  try {
    return buildAiGeneratedLeaseHtml(leaseContextFromApplication(application as RentalWizardFormState));
  } catch {
    return null;
  }
}

/**
 * Preview of uploaded PDF, saved generated HTML, or a read-only draft built from application data.
 */
export function LeaseDocumentPreview({ row, emptyHint, className }: Props) {
  const pdfSrc = row.managerUploadedPdf?.dataUrl ?? null;
  const defaultEmpty =
    emptyHint ??
    "No lease document yet — click Generate lease (from application data) or upload a PDF to preview it here.";

  const syntheticHtml = useMemo(
    () => (!pdfSrc && !row.generatedHtml ? draftHtmlFromApplication(row.application ?? undefined) : null),
    [pdfSrc, row.generatedHtml, row.application],
  );

  const showSynthetic = Boolean(syntheticHtml);

  return (
    <div className={`mt-4 overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-50/50 ${className ?? ""}`}>
      <p className="border-b border-slate-200/80 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
        Lease document
      </p>
      {showSynthetic ? (
        <p className="border-b border-sky-100 bg-sky-50/90 px-3 py-2 text-xs text-sky-900">
          Draft preview from saved application answers — use Generate to save a version to the pipeline, or upload a PDF.
        </p>
      ) : null}
      {pdfSrc ? (
        <iframe title="Lease PDF preview" src={pdfSrc} className="h-[min(52vh,420px)] w-full bg-white" />
      ) : row.generatedHtml ? (
        <iframe
          title="Generated lease"
          srcDoc={row.generatedHtml}
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          className="h-[min(52vh,420px)] w-full bg-white"
        />
      ) : syntheticHtml ? (
        <iframe
          title="Lease draft preview"
          srcDoc={syntheticHtml}
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          className="h-[min(52vh,420px)] w-full bg-white"
        />
      ) : (
        <div className="flex h-[min(36vh,280px)] items-center justify-center px-4 text-center text-sm text-slate-500">
          {defaultEmpty}
        </div>
      )}
    </div>
  );
}
