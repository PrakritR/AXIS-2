"use client";

import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { LeaseSectionBodyEditor } from "@/components/portal/lease-section-body-editor";
import { extractLeaseDocumentStyles, type LeaseHtmlSection } from "@/lib/lease-html-sections";
import {
  leaseDocumentHtmlForSectionEdit,
  readLeaseSectionsForEdit,
  saveLeaseSectionBodyEdits,
} from "@/lib/lease-section-edit.client";
import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";
import { cn } from "@/lib/utils";

type DraftMap = Record<string, string>;

type Props = {
  row: LeasePipelineRow;
  managerUserId?: string | null;
  onSaved: (row: LeasePipelineRow) => void;
  className?: string;
  embedded?: boolean;
  /** When true, use the full column height (document-only tab). */
  fullHeight?: boolean;
};

function draftsFromSections(sections: LeaseHtmlSection[]): DraftMap {
  return Object.fromEntries(sections.map((section) => [section.id, section.bodyHtml]));
}

export function LeaseSectionEditor({
  row,
  managerUserId,
  onSaved,
  className,
  embedded = false,
  fullHeight = false,
}: Props) {
  const sections = useMemo(() => readLeaseSectionsForEdit(row), [row]);
  const documentStyles = useMemo(
    () => extractLeaseDocumentStyles(row.generatedHtml ?? ""),
    [row.generatedHtml],
  );
  const [drafts, setDrafts] = useState<DraftMap>(() => draftsFromSections(sections));
  const [openSectionId, setOpenSectionId] = useState<string | null>(sections[0]?.id ?? null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDrafts(draftsFromSections(sections));
    setOpenSectionId(sections[0]?.id ?? null);
    setError(null);
  }, [row.id, row.generatedHtml, sections]);

  const dirtySectionIds = useMemo(
    () =>
      sections
        .filter((section) => (drafts[section.id] ?? "") !== section.bodyHtml)
        .map((section) => section.id),
    [drafts, sections],
  );

  const saveSection = useCallback(
    async (sectionId: string) => {
      const original = sections.find((section) => section.id === sectionId);
      if (!original) return;
      const nextBody = drafts[sectionId] ?? "";
      if (nextBody === original.bodyHtml) return;
      setSavingId(sectionId);
      setError(null);
      const result = saveLeaseSectionBodyEdits(row.id, { [sectionId]: nextBody }, managerUserId);
      setSavingId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved(result.row);
    },
    [drafts, managerUserId, onSaved, row.id, sections],
  );

  const saveAllDirty = useCallback(async () => {
    if (!dirtySectionIds.length) return;
    setSavingId("__all__");
    setError(null);
    const edits = Object.fromEntries(
      dirtySectionIds.map((id) => [id, drafts[id] ?? ""]),
    ) as DraftMap;
    const result = saveLeaseSectionBodyEdits(row.id, edits, managerUserId);
    setSavingId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved(result.row);
  }, [dirtySectionIds, drafts, managerUserId, onSaved, row.id]);

  if (!leaseDocumentHtmlForSectionEdit(row)) {
    return (
      <div className={cn("rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted", className)}>
        Section editing is available for generated HTML leases. Upload a PDF or generate the lease first.
      </div>
    );
  }

  if (!sections.length) {
    return (
      <div className={cn("rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted", className)}>
        No numbered sections were found in this lease document.
      </div>
    );
  }

  return (
    <div
      className={cn(embedded ? "space-y-3" : "flex min-h-0 flex-1 flex-col gap-3", className)}
      data-attr="lease-section-editor"
      id={embedded ? "lease-section-document" : undefined}
    >
      {!embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted">
            {sections.length} sections — edit any clause body below. Headings stay fixed; save updates the lease preview.
          </p>
          {dirtySectionIds.length > 0 ? (
            <Button
              type="button"
              variant="primary"
              className="rounded-full px-3 py-1.5 text-xs"
              disabled={savingId !== null}
              onClick={() => void saveAllDirty()}
              data-attr="lease-section-save-all"
            >
              {savingId === "__all__" ? "Saving…" : `Save ${dirtySectionIds.length} change${dirtySectionIds.length === 1 ? "" : "s"}`}
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">Lease document sections</h3>
          <p className="text-xs text-muted">
            Every numbered section and addendum (A–E) from this lease is listed below. Use Visual to edit text and tables; use HTML for images and advanced markup.
          </p>
          {dirtySectionIds.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              className="mt-2 rounded-full px-3 py-1.5 text-xs"
              disabled={savingId !== null}
              onClick={() => void saveAllDirty()}
              data-attr="lease-section-save-all"
            >
              {savingId === "__all__" ? "Saving…" : `Save ${dirtySectionIds.length} unsaved section${dirtySectionIds.length === 1 ? "" : "s"}`}
            </Button>
          ) : null}
        </div>
      )}
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      <div
        className={cn(
          embedded ? "space-y-2" : "min-h-0 flex-1 space-y-2 overflow-y-auto pr-1",
          fullHeight && "min-h-0 flex-1 overflow-y-auto",
        )}
      >
        {sections.map((section) => {
          const dirty = (drafts[section.id] ?? "") !== section.bodyHtml;
          const open = openSectionId === section.id;
          return (
            <div
              key={section.id}
              className="overflow-hidden rounded-xl border border-border bg-card"
              data-attr={`lease-section-${section.id}`}
            >
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition hover:bg-foreground/[0.02]"
                onClick={() => setOpenSectionId(open ? null : section.id)}
                aria-expanded={open}
              >
                <span className="min-w-0 text-sm font-semibold text-foreground">{section.title}</span>
                <span className="flex shrink-0 items-center gap-2">
                  {dirty ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                      Unsaved
                    </span>
                  ) : null}
                  <ChevronDown className={cn("h-4 w-4 text-muted transition", open ? "rotate-180" : "")} aria-hidden />
                </span>
              </button>
              {open ? (
                <div className="space-y-3 border-t border-border px-3 py-3">
                  <LeaseSectionBodyEditor
                    sectionId={section.id}
                    title={section.title}
                    value={drafts[section.id] ?? ""}
                    documentStyles={documentStyles}
                    onChange={(html) =>
                      setDrafts((current) => ({
                        ...current,
                        [section.id]: html,
                      }))
                    }
                  />
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant={dirty ? "primary" : "outline"}
                      className="rounded-full px-3 py-1.5 text-xs"
                      disabled={!dirty || savingId !== null}
                      onClick={() => void saveSection(section.id)}
                    >
                      {savingId === section.id ? "Saving…" : "Save section"}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
