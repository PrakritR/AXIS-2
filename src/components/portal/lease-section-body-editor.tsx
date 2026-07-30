"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

function escapeStyleTagClose(css: string): string {
  return css.replace(/<\/style/gi, "<\\/style");
}

function buildVisualEditorDocument(bodyHtml: string, documentStyles: string): string {
  const safeStyles = escapeStyleTagClose(documentStyles);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${safeStyles}</style></head><body class="lease-doc">${bodyHtml}</body></html>`;
}

/** WYSIWYG-style section body editor with optional raw HTML mode (tables, images, all markup). */
export function LeaseSectionBodyEditor({ sectionId, title, value, documentStyles, onChange }: Props) {
  const [mode, setMode] = useState<EditorMode>("visual");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const localValueRef = useRef(value);

  const visualDocument = useMemo(
    () => buildVisualEditorDocument(value, documentStyles),
    // Remount iframe when the section or stylesheet changes, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- value is applied on load and via sync effect
    [documentStyles, sectionId],
  );

  useEffect(() => {
    localValueRef.current = value;
  }, [value]);

  useEffect(() => {
    if (mode !== "visual") return;
    const iframe = iframeRef.current;
    if (!iframe) return;

    const bindEditor = () => {
      const body = iframe.contentDocument?.body;
      if (!body) return undefined;
      if (body.innerHTML !== localValueRef.current) {
        body.innerHTML = localValueRef.current;
      }
      body.contentEditable = "true";
      body.setAttribute("data-attr", "lease-section-visual-editor");
      const onInput = () => {
        const html = body.innerHTML;
        localValueRef.current = html;
        onChange(html);
      };
      body.addEventListener("input", onInput);
      return () => body.removeEventListener("input", onInput);
    };

    const onLoad = () => {
      bindEditor();
    };

    iframe.addEventListener("load", onLoad);
    const cleanup = iframe.contentDocument?.readyState === "complete" ? bindEditor() : undefined;
    return () => {
      iframe.removeEventListener("load", onLoad);
      cleanup?.();
    };
  }, [mode, onChange, sectionId, visualDocument]);

  useEffect(() => {
    if (mode !== "visual") return;
    const body = iframeRef.current?.contentDocument?.body;
    if (!body || body.innerHTML === value) return;
    body.innerHTML = value;
    localValueRef.current = value;
  }, [mode, sectionId, value]);

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
          <iframe
            key={`${sectionId}-visual`}
            ref={iframeRef}
            title={`${title} visual editor`}
            srcDoc={visualDocument}
            sandbox="allow-same-origin"
            className="min-h-[12rem] max-h-[min(50vh,22rem)] w-full border-0 bg-white"
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
