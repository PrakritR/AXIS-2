"use client";

import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { LeaseSectionStructuredEditor } from "@/components/portal/lease-section-structured-editor";
import { extractLeaseDocumentStyles, type LeaseHtmlSection } from "@/lib/lease-html-sections";
import {
  leaseDocumentHtmlForSectionEdit,
  readLeaseSectionsForEdit,
  saveLeaseSectionBodyEdits,
  saveLeaseSectionEdits,
} from "@/lib/lease-section-edit.client";
import {
  isEditableLeaseSection,
  sectionSourceFromHtml,
  type LeaseSectionEdit,
  type LeaseSectionFormat,
} from "@/lib/lease-section-text";
import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";
import { cn } from "@/lib/utils";

/**
 * A manager writes a section as words by default and can drop to HTML when they want it.
 * `lease-section-edit.client.ts` documents which representation is authoritative and why an
 * HTML save clears the typed overrides.
 *
 * Sections the document COMPUTES — the rent/fees schedule, the summary header, engine-inserted
 * disclosures, the signature block — are locked in EVERY mode. Their numbers must equal the
 * ledger's and their language is statutory, and HTML is not a smaller version of that problem
 * than prose is.
 */
type SectionMode = LeaseSectionFormat | "html";

type Props = {
  row: LeasePipelineRow;
  managerUserId?: string | null;
  onSaved: (row: LeasePipelineRow) => void;
  className?: string;
  embedded?: boolean;
  /** When true, use the full column height (document-only tab). */
  fullHeight?: boolean;
  /** Section opened from preview double-click. */
  selectedSectionId?: string | null;
  onFocusSectionHandled?: () => void;
  /** Left panel: only the active section (synced from document preview double-click). */
  focusOnly?: boolean;
};

type TextDraftMap = Record<string, LeaseSectionEdit>;
type HtmlDraftMap = Record<string, string>;
type ModeMap = Record<string, SectionMode>;

function seedTextDraft(section: LeaseHtmlSection, row: LeasePipelineRow): LeaseSectionEdit {
  return row.managerSectionEdits?.[section.id] ?? { format: "text", value: sectionSourceFromHtml(section.bodyHtml) };
}

function seedState(sections: LeaseHtmlSection[], row: LeasePipelineRow) {
  const text: TextDraftMap = {};
  const html: HtmlDraftMap = {};
  const modes: ModeMap = {};
  for (const section of sections) {
    text[section.id] = seedTextDraft(section, row);
    html[section.id] = section.bodyHtml;
    // Text is the default. A section already stored as prose reopens in the mode it was written in.
    modes[section.id] = row.managerSectionEdits?.[section.id]?.format ?? "text";
  }
  return { text, html, modes };
}

function lockReason(section: LeaseHtmlSection): string {
  if (/data-disclosure-rule=/i.test(section.bodyHtml)) return "Required disclosure language is generated from compliance rules.";
  if (/electronic signature/i.test(section.title)) return "Signature records are completed during signing.";
  return "This section is calculated from the lease terms, so editing it would disagree with the charges.";
}

export function LeaseSectionEditor({
  row,
  managerUserId,
  onSaved,
  className,
  embedded = false,
  fullHeight = false,
  selectedSectionId = null,
  onFocusSectionHandled,
  focusOnly = false,
}: Props) {
  const sections = useMemo(() => readLeaseSectionsForEdit(row), [row]);
  const documentStyles = useMemo(() => extractLeaseDocumentStyles(row.generatedHtml ?? ""), [row.generatedHtml]);
  const [textDrafts, setTextDrafts] = useState<TextDraftMap>(() => seedState(sections, row).text);
  const [htmlDrafts, setHtmlDrafts] = useState<HtmlDraftMap>(() => seedState(sections, row).html);
  const [modes, setModes] = useState<ModeMap>(() => seedState(sections, row).modes);
  const [openSectionId, setOpenSectionId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rowId = row.id;
  const rowGeneratedHtml = row.generatedHtml;
  useEffect(() => {
    const seeded = seedState(sections, row);
    setTextDrafts(seeded.text);
    setHtmlDrafts(seeded.html);
    setModes(seeded.modes);
    setOpenSectionId(null);
    setError(null);
    // Keyed on the lease and its document, not on `row` identity: the parent re-renders with a
    // fresh object often, and re-seeding on that would discard an edit mid-typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowId, rowGeneratedHtml, sections]);

  useEffect(() => {
    if (!selectedSectionId) return;
    if (!sections.some((section) => section.id === selectedSectionId)) {
      onFocusSectionHandled?.();
      return;
    }
    setOpenSectionId(selectedSectionId);
    onFocusSectionHandled?.();
    window.requestAnimationFrame(() => {
      document
        .querySelector(`[data-attr="lease-section-${selectedSectionId}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, [selectedSectionId, onFocusSectionHandled, sections]);

  const isDirty = useCallback(
    (section: LeaseHtmlSection) => {
      if (!isEditableLeaseSection(section)) return false;
      if ((modes[section.id] ?? "text") === "html") return (htmlDrafts[section.id] ?? "") !== section.bodyHtml;
      const draft = textDrafts[section.id];
      if (!draft) return false;
      const stored = seedTextDraft(section, row);
      return draft.format !== stored.format || draft.value !== stored.value;
    },
    [htmlDrafts, modes, row, textDrafts],
  );

  const dirtySectionIds = useMemo(() => sections.filter(isDirty).map((section) => section.id), [isDirty, sections]);

  const persist = useCallback(
    (ids: string[], label: string) => {
      const htmlIds = ids.filter((id) => (modes[id] ?? "text") === "html");
      const textIds = ids.filter((id) => (modes[id] ?? "text") !== "html");
      setSavingId(label);
      setError(null);

      // HTML first, deliberately. An HTML save rebuilds `generatedHtml` from the RENDERED
      // document and clears every typed override; running it after a text save in the same
      // batch would erase the text edit that just landed.
      let latest: LeasePipelineRow | null = null;
      if (htmlIds.length) {
        const edits = Object.fromEntries(htmlIds.map((id) => [id, htmlDrafts[id] ?? ""]));
        const result = saveLeaseSectionBodyEdits(rowId, edits, managerUserId);
        if (!result.ok) {
          setSavingId(null);
          setError(result.error);
          return;
        }
        latest = result.row;
      }
      if (textIds.length) {
        const edits = Object.fromEntries(textIds.map((id) => [id, textDrafts[id]!]));
        const result = saveLeaseSectionEdits(rowId, edits, managerUserId);
        if (!result.ok) {
          setSavingId(null);
          setError(result.error);
          return;
        }
        latest = result.row;
      }
      setSavingId(null);
      if (latest) onSaved(latest);
    },
    [htmlDrafts, managerUserId, modes, onSaved, rowId, textDrafts],
  );

  const resetSection = useCallback(
    (section: LeaseHtmlSection) => {
      setHtmlDrafts((current) => ({ ...current, [section.id]: section.bodyHtml }));
      setTextDrafts((current) => ({ ...current, [section.id]: seedTextDraft(section, row) }));
    },
    [row],
  );

  const setMode = useCallback((sectionId: string, mode: SectionMode) => {
    setModes((current) => ({ ...current, [sectionId]: mode }));
    setTextDrafts((current) => {
      const draft = current[sectionId];
      if (!draft || mode === "html") return current;
      return { ...current, [sectionId]: { ...draft, format: mode } };
    });
  }, []);

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

  const renderEditor = (section: LeaseHtmlSection) => {
    const mode = modes[section.id] ?? "text";
    return (
      <div className="space-y-3">
        <fieldset className="space-y-2">
          <legend className="sr-only">Editing mode for {section.title}</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`Editing mode for ${section.title}`}>
            {(
              [
                ["text", "Text"],
                ["rich", "Formatted"],
                ["html", "HTML"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mode === value}
                onClick={() => setMode(section.id, value)}
                className={cn(
                  "min-h-10 rounded-full border px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  mode === value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-foreground hover:bg-accent",
                )}
                data-attr={`lease-section-mode-${value}`}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        {mode === "html" ? (
          <LeaseSectionStructuredEditor
            sectionId={section.id}
            title={section.title}
            value={htmlDrafts[section.id] ?? ""}
            documentStyles={documentStyles}
            onChange={(html) => setHtmlDrafts((current) => ({ ...current, [section.id]: html }))}
          />
        ) : (
          <div className="space-y-1.5">
            <label htmlFor={`lease-section-content-${section.id}`} className="sr-only">
              {section.title}
            </label>
            <Textarea
              id={`lease-section-content-${section.id}`}
              value={textDrafts[section.id]?.value ?? ""}
              onChange={(event) =>
                setTextDrafts((current) => {
                  const draft = current[section.id];
                  if (!draft) return current;
                  return { ...current, [section.id]: { ...draft, value: event.target.value } };
                })
              }
              rows={Math.min(18, Math.max(6, (textDrafts[section.id]?.value ?? "").split("\n").length + 2))}
              className="min-h-36"
              data-attr="lease-section-content"
            />
            <p className="text-xs text-muted">
              {mode === "rich"
                ? "Formatted mode understands **bold**, *italic*, ### headings, lists, and --- rules."
                : "Write in plain words. Blank lines start new paragraphs; the lease styling is applied for you."}
            </p>
          </div>
        )}
      </div>
    );
  };

  const activeSection = openSectionId ? sections.find((section) => section.id === openSectionId) : null;

  if (focusOnly) {
    return (
      <div className={cn("flex min-h-0 flex-1 flex-col", className)} data-attr="lease-section-editor">
        {error ? <p className="mb-2 text-sm text-rose-700">{error}</p> : null}
        {!activeSection ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-accent/20 px-4 py-8 text-center">
            <p className="text-sm font-medium text-foreground">Double-click a section in the document</p>
            <p className="mt-1 max-w-[16rem] text-xs text-muted">
              The editor opens here for the section you select on the right.
            </p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
            <div className="flex shrink-0 items-center justify-between gap-2">
              <h3 className="min-w-0 text-sm font-semibold text-foreground">{activeSection.title}</h3>
              {isDirty(activeSection) ? (
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                  Unsaved
                </span>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5 [-webkit-overflow-scrolling:touch]">
              {isEditableLeaseSection(activeSection) ? (
                renderEditor(activeSection)
              ) : (
                <p className="rounded-lg border border-border bg-accent/20 px-3 py-3 text-xs text-muted">
                  Not editable. {lockReason(activeSection)}
                </p>
              )}
            </div>
            {isEditableLeaseSection(activeSection) ? (
              <div className="flex shrink-0 justify-end gap-2 border-t border-border pt-3">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  disabled={savingId !== null || !isDirty(activeSection)}
                  onClick={() => resetSection(activeSection)}
                >
                  Reset
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  className="rounded-full"
                  disabled={savingId !== null || !isDirty(activeSection)}
                  onClick={() => persist([activeSection.id], activeSection.id)}
                  data-attr="lease-section-save"
                >
                  {savingId === activeSection.id ? "Saving…" : "Save changes"}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        embedded ? "flex min-h-0 flex-1 flex-col gap-2" : "flex min-h-0 flex-1 flex-col gap-3",
        fullHeight && "h-full",
        className,
      )}
      data-attr="lease-section-editor"
      id={embedded ? "lease-section-document" : undefined}
    >
      {!embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted">
            {sections.length} sections — double-click a section in the preview to edit it here, or expand any section below.
          </p>
          {dirtySectionIds.length > 0 ? (
            <Button
              type="button"
              variant="primary"
              className="rounded-full px-3 py-1.5 text-xs"
              disabled={savingId !== null}
              onClick={() => persist(dirtySectionIds, "__all__")}
              data-attr="lease-section-save-all"
            >
              {savingId === "__all__" ? "Saving…" : `Save ${dirtySectionIds.length} change${dirtySectionIds.length === 1 ? "" : "s"}`}
            </Button>
          ) : null}
        </div>
      ) : dirtySectionIds.length > 0 ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            className="rounded-full px-3 py-1.5 text-xs"
            disabled={savingId !== null}
            onClick={() => persist(dirtySectionIds, "__all__")}
            data-attr="lease-section-save-all"
          >
            {savingId === "__all__" ? "Saving…" : `Save ${dirtySectionIds.length} unsaved section${dirtySectionIds.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      ) : null}
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      <div
        className={cn(
          "min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1 [-webkit-overflow-scrolling:touch]",
          embedded && "min-h-0",
        )}
      >
        {sections.map((section) => {
          const editable = isEditableLeaseSection(section);
          const dirty = isDirty(section);
          const open = openSectionId === section.id;
          return (
            <div
              key={section.id}
              className={cn(
                "overflow-hidden rounded-xl border bg-card",
                selectedSectionId === section.id ? "border-primary/50 ring-2 ring-primary/20" : "border-border",
              )}
              data-attr={`lease-section-${section.id}`}
            >
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition hover:bg-foreground/[0.02]"
                onClick={() => setOpenSectionId(open ? null : section.id)}
                aria-expanded={open}
              >
                <span className={cn("min-w-0 text-sm font-semibold", editable ? "text-foreground" : "text-muted")}>
                  {section.title}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {dirty ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                      Unsaved
                    </span>
                  ) : null}
                  {!editable ? (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Locked</span>
                  ) : null}
                  <ChevronDown className={cn("h-4 w-4 text-muted transition", open ? "rotate-180" : "")} aria-hidden />
                </span>
              </button>
              {open ? (
                <div className="space-y-3 border-t border-border px-3 py-3">
                  {editable ? (
                    <>
                      {renderEditor(section)}
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-full px-3 py-1.5 text-xs"
                          disabled={!dirty || savingId !== null}
                          onClick={() => resetSection(section)}
                        >
                          Reset
                        </Button>
                        <Button
                          type="button"
                          variant={dirty ? "primary" : "outline"}
                          className="rounded-full px-3 py-1.5 text-xs"
                          disabled={!dirty || savingId !== null}
                          onClick={() => persist([section.id], section.id)}
                          data-attr="lease-section-save"
                        >
                          {savingId === section.id ? "Saving…" : "Save section"}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-muted">Not editable. {lockReason(section)}</p>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
