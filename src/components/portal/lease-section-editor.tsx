"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { readLeaseSectionsForEdit, saveLeaseSectionEdits } from "@/lib/lease-section-edit.client";
import { isEditableLeaseSection, sectionSourceFromHtml, type LeaseSectionEdit } from "@/lib/lease-section-text";
import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";
import { cn } from "@/lib/utils";

type Props = {
  row: LeasePipelineRow;
  managerUserId?: string | null;
  onSaved: (row: LeasePipelineRow) => void;
  className?: string;
  embedded?: boolean;
  fullHeight?: boolean;
};

function readonlyReason(section: { title: string; bodyHtml: string }): string {
  if (/data-disclosure-rule=/i.test(section.bodyHtml)) return "Required disclosure language is generated from compliance rules.";
  if (/electronic signature/i.test(section.title)) return "Signature records are completed during signing.";
  return "This section is derived from lease terms and cannot be edited here.";
}

export function LeaseSectionEditor({ row, managerUserId, onSaved, className, embedded = false, fullHeight = false }: Props) {
  const sections = useMemo(() => readLeaseSectionsForEdit(row), [row]);
  const [openSectionId, setOpenSectionId] = useState<string | null>(null);
  const [draft, setDraft] = useState<LeaseSectionEdit | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = sections.find((section) => section.id === openSectionId) ?? null;

  const open = (sectionId: string) => {
    const section = sections.find((candidate) => candidate.id === sectionId);
    if (!section || !isEditableLeaseSection(section)) return;
    setOpenSectionId(section.id);
    setDraft(row.managerSectionEdits?.[section.id] ?? { format: "text", value: sectionSourceFromHtml(section.bodyHtml) });
    setError(null);
  };

  const save = () => {
    if (!active || !draft) return;
    setSaving(true);
    setError(null);
    const result = saveLeaseSectionEdits(row.id, { [active.id]: draft }, managerUserId);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved(result.row);
  };

  if (!sections.length) {
    return <div className={cn("rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted", className)}>Generate an HTML lease before editing sections.</div>;
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-3", fullHeight && "h-full", className)} data-attr="lease-section-editor">
      <p className="text-xs text-muted">Choose a section to edit. Required disclosures and ledger-derived sections stay locked.</p>
      {error ? <p className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p> : null}
      <div className={cn("min-h-0 space-y-2 overflow-y-auto", embedded && "flex-1")}>
        {sections.map((section) => {
          const editable = isEditableLeaseSection(section);
          const selected = section.id === openSectionId;
          return (
            <div key={section.id} className={cn("rounded-xl border bg-card", selected ? "border-primary/50 ring-2 ring-primary/20" : "border-border")}>
              {editable ? (
                <button type="button" onClick={() => open(section.id)} className="flex min-h-11 w-full items-center px-3 py-3 text-left text-sm font-semibold text-foreground transition hover:bg-foreground/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-attr={`lease-section-select-${section.id}`}>
                  {section.title}
                </button>
              ) : (
                <div className="px-3 py-3">
                  <p className="text-sm font-semibold text-muted">{section.title}</p>
                  <p className="mt-1 text-xs text-muted">Not editable. {readonlyReason(section)}</p>
                </div>
              )}
              {selected && active && draft ? (
                <div className="space-y-3 border-t border-border px-3 py-3">
                  <fieldset className="space-y-2">
                    <legend className="text-xs font-semibold text-foreground">Formatting</legend>
                    <div className="flex gap-2" role="radiogroup" aria-label="Section formatting">
                      {(["text", "rich"] as const).map((format) => (
                        <button key={format} type="button" role="radio" aria-checked={draft.format === format} onClick={() => setDraft((current) => current ? { ...current, format } : current)} className={cn("min-h-10 rounded-full border px-3 text-xs font-semibold capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", draft.format === format ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground hover:bg-accent")} data-attr={`lease-section-format-${format}`}>
                          {format}
                        </button>
                      ))}
                    </div>
                    {draft.format === "rich" ? <p className="text-xs text-muted">Switching back to text removes rich formatting when you save.</p> : null}
                  </fieldset>
                  <div className="space-y-1.5">
                    <label htmlFor={`lease-section-content-${active.id}`} className="text-xs font-semibold text-foreground">{active.title}</label>
                    <Textarea id={`lease-section-content-${active.id}`} value={draft.value} onChange={(event) => setDraft((current) => current ? { ...current, value: event.target.value } : current)} rows={Math.min(16, Math.max(6, draft.value.split("\n").length + 2))} className="min-h-36" data-attr="lease-section-content" />
                    <p className="text-xs text-muted">Text is stored as content, not HTML. Rich supports bold, italic, headings, rules, and lists.</p>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" className="rounded-full" onClick={() => setOpenSectionId(null)}>Cancel</Button>
                    <Button type="button" variant="primary" className="rounded-full" disabled={saving} onClick={save} data-attr="lease-section-save">{saving ? "Saving…" : "Save section"}</Button>
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
