"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type EditorMode = "visual" | "html";

type Props = {
  sectionId: string;
  title: string;
  value: string;
  documentStyles: string;
  onChange: (html: string) => void;
};

/** WYSIWYG-style section body editor with optional raw HTML mode (tables, images, all markup). */
export function LeaseSectionBodyEditor({ sectionId, title, value, documentStyles, onChange }: Props) {
  const [mode, setMode] = useState<EditorMode>("visual");
  const visualRef = useRef<HTMLDivElement>(null);
  const lastSyncedValue = useRef(value);

  useLayoutEffect(() => {
    if (mode !== "visual" || !visualRef.current) return;
    visualRef.current.innerHTML = value;
    lastSyncedValue.current = value;
  }, [mode, sectionId]);

  useEffect(() => {
    if (mode !== "visual" || !visualRef.current) return;
    if (lastSyncedValue.current !== value) {
      visualRef.current.innerHTML = value;
      lastSyncedValue.current = value;
    }
  }, [mode, value, sectionId]);

  return (
    <div className="space-y-2" data-attr={`lease-section-body-editor-${sectionId}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">Edit words, tables, and images. Switch to HTML for precise markup.</p>
        <div className="flex gap-1 rounded-full border border-border bg-muted/30 p-0.5">
          {(["visual", "html"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize transition",
                mode === tab ? "bg-card text-foreground shadow-sm" : "text-muted",
              )}
              onClick={() => setMode(tab)}
              data-attr={`lease-section-mode-${tab}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {mode === "visual" ? (
        <div className="overflow-hidden rounded-xl border border-border bg-white">
          <style dangerouslySetInnerHTML={{ __html: documentStyles }} />
          <div
            ref={visualRef}
            contentEditable
            suppressContentEditableWarning
            className="lease-doc min-h-[12rem] max-h-[min(50vh,22rem)] overflow-y-auto px-4 py-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            onInput={() => {
              const html = visualRef.current?.innerHTML ?? "";
              lastSyncedValue.current = html;
              onChange(html);
            }}
            aria-label={`${title} visual editor`}
            data-attr="lease-section-visual-editor"
          />
        </div>
      ) : (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={Math.min(22, Math.max(10, value.split("\n").length + 2))}
          className="min-h-[12rem] font-mono text-xs leading-relaxed"
          aria-label={`${title} HTML editor`}
          data-attr="lease-section-html-editor"
        />
      )}
    </div>
  );
}
