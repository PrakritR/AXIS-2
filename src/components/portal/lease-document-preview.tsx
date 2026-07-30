"use client";

import { useMemo } from "react";
import { getLeaseDocumentHtml, type LeasePipelineRow } from "@/lib/lease-pipeline-storage";
import type { RentalWizardFormState } from "@/lib/rental-application/types";
import { buildAiGeneratedLeaseHtml, leaseContextFromApplication } from "@/lib/generated-lease";

type Props = {
  row: LeasePipelineRow;
  /** Shown when there is no PDF and no generated HTML */
  emptyHint?: string;
  /** When true, do not render a synthetic draft from application answers (manual add-resident). */
  suppressApplicationDraft?: boolean;
  className?: string;
  /** Fixed-height, non-scrollable peek for modal chrome (full doc stays on the page behind). */
  peek?: boolean;
  /** Fill the parent flex area with a scrollable document frame (lease edit modal). */
  fill?: boolean;
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
export function LeaseDocumentPreview({ row, emptyHint, suppressApplicationDraft, className, peek = false, fill = false }: Props) {
  const pdfSrc = row.managerUploadedPdf?.dataUrl ?? null;
  const html = getLeaseDocumentHtml(row);
  const defaultEmpty =
    emptyHint ??
    "No lease document yet. Click Generate lease (from application data) or upload a PDF to preview it here.";

  const syntheticHtml = useMemo(() => {
    if (suppressApplicationDraft || pdfSrc || html || row.leaseDocumentRemovedAt) return null;
    return draftHtmlFromApplication(row.application ?? undefined);
  }, [pdfSrc, html, row.application, row.leaseDocumentRemovedAt, suppressApplicationDraft]);

  const showSynthetic = Boolean(syntheticHtml);
  const frameClass = fill
    ? "absolute inset-0 h-full w-full border-0 bg-card"
    : peek
      ? "h-[7.25rem] w-full bg-card pointer-events-none sm:h-[8.5rem]"
      : "h-[min(52vh,420px)] w-full bg-card";
  const emptyClass = fill
    ? "flex min-h-[12rem] flex-1 items-center justify-center px-4 text-center text-sm text-muted"
    : peek
      ? "flex h-[7.25rem] items-center justify-center px-4 text-center text-sm text-muted sm:h-[8.5rem]"
      : "flex h-[min(36vh,280px)] items-center justify-center px-4 text-center text-sm text-muted";
  const frameScroll = peek ? "no" : "yes";

  return (
    <div
      className={`mt-4 overflow-hidden rounded-2xl border border-border bg-accent/30 ${peek || fill ? "mt-0" : ""} ${fill ? "flex min-h-0 flex-1 flex-col" : ""} ${className ?? ""}`}
    >
      <p className="border-b border-border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
        Lease document
      </p>
      {showSynthetic ? (
        <p className="border-b px-3 py-2 text-xs portal-banner-info">
          Draft preview from saved application answers. Use Generate to save a version to the pipeline, or upload a PDF.
        </p>
      ) : null}
      {pdfSrc ? (
        <div className={fill ? "relative flex min-h-[min(42vh,20rem)] flex-1 flex-col" : undefined}>
          {(row.residentSignature || row.managerSignature) && row.managerUploadedPdf?.dataUrl ? (
            <p className="shrink-0 border-b px-3 py-2 text-xs portal-banner-success">
              Signature certificate page appended to this PDF.
            </p>
          ) : null}
          <div className={fill ? "relative min-h-0 flex-1 overflow-hidden" : undefined}>
            <iframe title="Lease PDF preview" src={pdfSrc} scrolling={frameScroll} className={frameClass} />
          </div>
        </div>
      ) : html ? (
        <div className={fill ? "relative flex min-h-[min(42vh,20rem)] flex-1 flex-col" : undefined}>
          <div className={fill ? "relative min-h-0 flex-1 overflow-hidden" : undefined}>
            <iframe
              title="Lease document"
              srcDoc={html}
              sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
              scrolling={frameScroll}
              className={frameClass}
            />
          </div>
        </div>
      ) : syntheticHtml ? (
        <div className={fill ? "relative flex min-h-[min(42vh,20rem)] flex-1 flex-col" : undefined}>
          <div className={fill ? "relative min-h-0 flex-1 overflow-hidden" : undefined}>
            <iframe
              title="Lease draft preview"
              srcDoc={syntheticHtml}
              sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
              scrolling={frameScroll}
              className={frameClass}
            />
          </div>
        </div>
      ) : (
        <div className={emptyClass}>
          {defaultEmpty}
        </div>
      )}
    </div>
  );
}
