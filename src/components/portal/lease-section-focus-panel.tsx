"use client";

import { useMemo } from "react";
import { LeaseSectionStructuredEditor } from "@/components/portal/lease-section-structured-editor";
import { applyLeaseSectionBodyEdits, extractLeaseDocumentStyles, parseLeaseHtmlSections } from "@/lib/lease-html-sections";
import { cn } from "@/lib/utils";

type Props = {
  documentHtml: string;
  activeSectionId: string | null;
  onDocumentHtmlChange: (html: string) => void;
  className?: string;
};

/** Left panel: quick label/value fields for the section selected in the visual document. */
export function LeaseSectionFocusPanel({
  documentHtml,
  activeSectionId,
  onDocumentHtmlChange,
  className,
}: Props) {
  const sections = useMemo(() => parseLeaseHtmlSections(documentHtml), [documentHtml]);
  const activeSection = activeSectionId ? sections.find((section) => section.id === activeSectionId) : undefined;
  const documentStyles = useMemo(() => extractLeaseDocumentStyles(documentHtml), [documentHtml]);

  const updateSectionBody = (sectionId: string, bodyHtml: string) => {
    onDocumentHtmlChange(applyLeaseSectionBodyEdits(documentHtml, { [sectionId]: bodyHtml }));
  };

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)} data-attr="lease-section-focus-panel">
      {!activeSection ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-accent/20 px-4 py-8 text-center">
          <p className="text-sm font-medium text-foreground">Section fields</p>
          <p className="mt-1 max-w-[16rem] text-xs text-muted">
            Click a section in the document editor on the right to edit summary rows here.
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
          <h3 className="shrink-0 text-sm font-semibold text-foreground">{activeSection.title}</h3>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5 [-webkit-overflow-scrolling:touch]">
            <LeaseSectionStructuredEditor
              key={activeSection.id}
              sectionId={activeSection.id}
              title={activeSection.title}
              value={activeSection.bodyHtml}
              documentStyles={documentStyles}
              fieldsOnly
              onChange={(body) => updateSectionBody(activeSection.id, body)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
