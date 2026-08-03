"use client";

import { useEffect, useMemo } from "react";
import { UploadedLeasePdfPreview } from "@/components/portal/uploaded-lease-pdf-preview";
import { getLeaseDocumentHtml, type LeasePipelineRow } from "@/lib/lease-pipeline-storage";
import { injectLeasePreviewSectionMarkers } from "@/lib/lease-html-sections";
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
  /** Grow to fill the parent while keeping the lease document label (resident profile). */
  stretch?: boolean;
  /** Enable double-click section selection (posts section id to parent). */
  interactive?: boolean;
  onSectionSelect?: (sectionId: string) => void;
};

function draftHtmlFromApplication(application: Partial<RentalWizardFormState> | undefined): string | null {
  if (!application || !Object.keys(application).length) return null;
  try {
    const outcome = buildAiGeneratedLeaseHtml(leaseContextFromApplication(application as RentalWizardFormState));
    return outcome.kind === "generated" ? outcome.html : null;
  } catch {
    return null;
  }
}

/**
 * Preview of uploaded PDF, saved generated HTML, or a read-only draft built from application data.
 */
export function LeaseDocumentPreview({
  row,
  emptyHint,
  suppressApplicationDraft,
  className,
  peek = false,
  fill = false,
  stretch = false,
  interactive = false,
  onSectionSelect,
}: Props) {
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
  const previewHtml = useMemo(() => {
    const source = html ?? syntheticHtml;
    if (!source) return null;
    return interactive ? injectLeasePreviewSectionMarkers(source) : source;
  }, [html, syntheticHtml, interactive]);

  useEffect(() => {
    if (!interactive || !onSectionSelect) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== "lease-preview-section-dblclick") return;
      const sectionId = typeof event.data.sectionId === "string" ? event.data.sectionId : "";
      if (sectionId) onSectionSelect(sectionId);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [interactive, onSectionSelect]);
  const flexibleHeight = fill || stretch;
  const frameClass = flexibleHeight
    ? "absolute inset-0 h-full w-full border-0 bg-card"
    : peek
      ? "h-[7.25rem] w-full bg-card pointer-events-none sm:h-[8.5rem]"
      : "h-[min(52vh,420px)] w-full bg-card";
  const emptyClass = flexibleHeight
    ? "flex min-h-[12rem] flex-1 items-center justify-center px-4 text-center text-sm text-muted"
    : peek
      ? "flex h-[7.25rem] items-center justify-center px-4 text-center text-sm text-muted sm:h-[8.5rem]"
      : "flex h-[min(36vh,280px)] items-center justify-center px-4 text-center text-sm text-muted";
  const frameScroll = peek ? "no" : "yes";

  return (
    <div
      className={`mt-4 overflow-hidden rounded-2xl border border-border bg-accent/30 ${peek || flexibleHeight ? "mt-0" : ""} ${flexibleHeight ? "flex flex-1 flex-col" : ""} ${className ?? ""}`}
    >
      {fill && interactive ? (
        <p className="shrink-0 border-b border-border px-3 py-1.5 text-[11px] text-muted">
          Double-click any highlighted section to edit
        </p>
      ) : null}
      {!fill ? (
        <p className="border-b border-border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
          Lease document
          {interactive ? (
            <span className="ml-2 font-medium normal-case tracking-normal text-primary">· double-click a section to edit</span>
          ) : null}
        </p>
      ) : null}
      {showSynthetic ? (
        <p className="border-b px-3 py-2 text-xs portal-banner-info">
          Draft preview from saved application answers. Use Generate to save a version to the pipeline, or upload a PDF.
        </p>
      ) : null}
      {pdfSrc ? (
        <div className={flexibleHeight ? "relative flex min-h-0 flex-1 flex-col" : undefined}>
          {(row.residentSignature || row.managerSignature) && row.managerUploadedPdf?.dataUrl ? (
            <p className="shrink-0 border-b px-3 py-2 text-xs portal-banner-success">
              Signature certificate page appended to this PDF.
            </p>
          ) : null}
          <UploadedLeasePdfPreview
            dataUrl={pdfSrc}
            title="Lease PDF preview"
            fileName={row.managerUploadedPdf?.fileName}
            embeddedInFlex={flexibleHeight}
            className={flexibleHeight ? "flex min-h-0 flex-1 flex-col" : undefined}
          />
        </div>
      ) : previewHtml ? (
        <div className={flexibleHeight ? "relative flex min-h-0 flex-1 flex-col" : undefined}>
          <div className={flexibleHeight ? "relative min-h-0 flex-1 overflow-hidden" : undefined}>
            <iframe
              title="Lease document"
              srcDoc={previewHtml}
              // NEVER allow-scripts together with allow-same-origin: that combination lets the
              // frame reach out of the sandbox into the parent origin, and this preview is
              // mounted in the RESIDENT portal. Scripts are granted only for the manager's
              // interactive section picker, which talks back over postMessage and does not
              // need same-origin. Everything else, including every resident view, gets no
              // scripting at all.
              sandbox={interactive ? "allow-scripts" : ""}
              scrolling={frameScroll}
              className={frameClass}
            />
          </div>
        </div>
      ) : syntheticHtml ? (
        <div className={flexibleHeight ? "relative flex min-h-0 flex-1 flex-col" : undefined}>
          <div className={flexibleHeight ? "relative min-h-0 flex-1 overflow-hidden" : undefined}>
            <iframe
              title="Lease draft preview"
              srcDoc={syntheticHtml}
              sandbox=""
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
