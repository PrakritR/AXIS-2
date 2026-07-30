"use client";

import { useEffect, useMemo, useState } from "react";
import { Input, Textarea } from "@/components/ui/input";
import { LeaseSectionBodyEditor } from "@/components/portal/lease-section-body-editor";
import {
  leaseSectionHasStructuredFields,
  parseLeaseSectionEditableParts,
  rebuildBodyHtmlFromParts,
  type LeaseSectionEditablePart,
} from "@/lib/lease-section-structured-edit";
import { cn } from "@/lib/utils";

type Props = {
  sectionId: string;
  title: string;
  value: string;
  documentStyles: string;
  onChange: (html: string) => void;
  /** When true, only label/value fields — visual/HTML editing lives on the document panel. */
  fieldsOnly?: boolean;
};

export function LeaseSectionStructuredEditor({
  sectionId,
  title,
  value,
  documentStyles,
  onChange,
  fieldsOnly = false,
}: Props) {
  const parsedParts = useMemo(() => parseLeaseSectionEditableParts(value), [value, sectionId]);
  const [parts, setParts] = useState<LeaseSectionEditablePart[]>(parsedParts);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const hasStructured = leaseSectionHasStructuredFields(parsedParts);

  useEffect(() => {
    const next = parseLeaseSectionEditableParts(value);
    setParts(next);
    if (!fieldsOnly) {
      setShowAdvanced(!leaseSectionHasStructuredFields(next));
    }
  }, [fieldsOnly, sectionId]);

  const updateParts = (nextParts: LeaseSectionEditablePart[]) => {
    setParts(nextParts);
    onChange(rebuildBodyHtmlFromParts(nextParts));
  };

  const updatePart = (partId: string, patch: Partial<LeaseSectionEditablePart>) => {
    const nextParts = parts.map((part) => {
      if (part.id !== partId) return part;
      return { ...part, ...patch } as LeaseSectionEditablePart;
    });
    updateParts(nextParts);
  };

  return (
    <div className="space-y-3" data-attr={`lease-section-structured-editor-${sectionId}`}>
      {hasStructured ? (
        <div className="space-y-3">
          {parts.map((part) => {
            if (part.kind === "table-row") {
              return (
                <div key={part.id} className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted">
                      {part.label || "Label"}
                    </label>
                    <Input
                      value={part.label}
                      onChange={(e) => updatePart(part.id, { label: e.target.value })}
                      data-attr={`lease-section-field-label-${part.id}`}
                      className="rounded-full"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted">Value</label>
                    <Input
                      value={part.value}
                      onChange={(e) => updatePart(part.id, { value: e.target.value })}
                      data-attr={`lease-section-field-value-${part.id}`}
                      className="rounded-full"
                    />
                  </div>
                </div>
              );
            }
            if (part.kind === "paragraph" || part.kind === "list-item") {
              return (
                <div key={part.id}>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted">
                    {part.kind === "list-item" ? "List item" : "Paragraph"}
                  </label>
                  <Textarea
                    value={part.text}
                    onChange={(e) =>
                      updatePart(part.id, part.kind === "list-item" ? { text: e.target.value } : { text: e.target.value })
                    }
                    rows={Math.min(8, Math.max(3, part.text.split("\n").length + 1))}
                    data-attr={`lease-section-field-text-${part.id}`}
                  />
                </div>
              );
            }
            return null;
          })}
          {!fieldsOnly ? (
          <button
            type="button"
            className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
            onClick={() => setShowAdvanced((open) => !open)}
            data-attr="lease-section-toggle-advanced"
          >
            {showAdvanced ? "Hide advanced editor" : "Advanced HTML editor"}
          </button>
          ) : null}
        </div>
      ) : null}

      {!fieldsOnly && (showAdvanced || !hasStructured) ? (
        <div className="space-y-2 border-t border-border pt-3">
          <LeaseSectionBodyEditor
            sectionId={sectionId}
            title={title}
            value={value}
            documentStyles={documentStyles}
            onChange={onChange}
          />
        </div>
      ) : null}

    </div>
  );
}
