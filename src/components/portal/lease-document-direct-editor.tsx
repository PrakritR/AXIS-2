"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { LocalDestinationNav } from "@/components/ui/destination-nav";
import { injectLeaseVisualEditDocument, serializeLeaseEditorDocument } from "@/lib/lease-html-sections";
import { saveLeaseDocumentHtml } from "@/lib/lease-section-edit.client";
import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";
import { cn } from "@/lib/utils";

type EditorMode = "visual" | "html";

type Props = {
  row: LeasePipelineRow;
  managerUserId?: string | null;
  html: string;
  baselineHtml: string;
  onChange: (html: string) => void;
  onSaved: (row: LeasePipelineRow) => void;
  onSectionFocus?: (sectionId: string) => void;
  className?: string;
};

/** Full-lease direct editor with Visual / HTML modes. */
export function LeaseDocumentDirectEditor({
  row,
  managerUserId,
  html,
  baselineHtml,
  onChange,
  onSaved,
  onSectionFocus,
  className,
}: Props) {
  const [mode, setMode] = useState<EditorMode>("visual");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const skipExternalSyncRef = useRef(false);
  const documentKeyRef = useRef<string | null>(null);
  const prevModeRef = useRef<EditorMode>(mode);
  const dirty = html.trim() !== baselineHtml.trim();

  const bindEditor = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) return undefined;

    doc.body.contentEditable = "true";
    doc.body.setAttribute("spellcheck", "true");
    doc.body.setAttribute("data-attr", "lease-document-visual-editor");

    const onInput = () => {
      skipExternalSyncRef.current = true;
      onChange(serializeLeaseEditorDocument(doc));
    };
    doc.body.addEventListener("input", onInput);
    return () => doc.body.removeEventListener("input", onInput);
  }, [onChange]);

  const loadDocument = useCallback(
    (sourceHtml: string, opts?: { preserveScroll?: boolean }) => {
      const iframe = iframeRef.current;
      const doc = iframe?.contentDocument;
      const win = iframe?.contentWindow;
      if (!iframe || !doc) return;
      const scrollX = opts?.preserveScroll && win ? win.scrollX : 0;
      const scrollY = opts?.preserveScroll && win ? win.scrollY : 0;
      const prepared = injectLeaseVisualEditDocument(sourceHtml);
      doc.open();
      doc.write(prepared);
      doc.close();
      documentKeyRef.current = sourceHtml;
      if (opts?.preserveScroll && win) {
        win.scrollTo(scrollX, scrollY);
      }
      return bindEditor();
    },
    [bindEditor],
  );

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== "lease-visual-section-focus") return;
      const sectionId = typeof event.data.sectionId === "string" ? event.data.sectionId : "";
      if (sectionId) onSectionFocus?.(sectionId);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onSectionFocus]);

  useEffect(() => {
    const fromHtml = prevModeRef.current === "html" && mode === "visual";
    const firstLoad = mode === "visual" && documentKeyRef.current === null;
    if (firstLoad || fromHtml) {
      loadDocument(html);
    }
    prevModeRef.current = mode;
  }, [html, loadDocument, mode]);

  // Apply external html changes (reset, agent refresh) without disturbing in-progress visual edits.
  useEffect(() => {
    if (mode !== "visual") return;
    if (skipExternalSyncRef.current) {
      skipExternalSyncRef.current = false;
      documentKeyRef.current = html;
      return;
    }
    if (documentKeyRef.current === html) return;
    const cleanup = loadDocument(html, { preserveScroll: true });
    return () => cleanup?.();
  }, [html, loadDocument, mode]);

  const save = () => {
    if (!dirty) return;
    setSaving(true);
    setError(null);
    const result = saveLeaseDocumentHtml(row.id, html, managerUserId);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved(result.row);
  };

  return (
    <div
      className={cn("flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card", className)}
      data-attr="lease-document-direct-editor"
    >
      <div className="shrink-0 border-b border-border px-3 py-2">
        <LocalDestinationNav
          items={[
            { id: "visual", label: "Visual", dataAttr: "lease-document-mode-visual" },
            { id: "html", label: "HTML", dataAttr: "lease-document-mode-html" },
          ]}
          activeId={mode}
          onChange={(id) => setMode(id as EditorMode)}
          ariaLabel="Lease editor view"
        />
      </div>

      {error ? <p className="shrink-0 px-3 py-1.5 text-sm text-rose-700">{error}</p> : null}

      <div className="relative min-h-0 flex-1 overflow-hidden bg-white">
        {mode === "visual" ? (
          <iframe
            ref={iframeRef}
            title="Lease visual editor"
            sandbox="allow-same-origin allow-scripts"
            className="absolute inset-0 h-full w-full border-0 bg-white"
          />
        ) : (
          <Textarea
            value={html}
            onChange={(e) => onChange(e.target.value)}
            className="h-full min-h-0 resize-none rounded-none border-0 bg-white font-mono text-xs leading-relaxed shadow-none focus-visible:ring-0"
            aria-label="Lease HTML editor"
            data-attr="lease-document-html-editor"
          />
        )}
      </div>

      <div className="flex shrink-0 justify-end gap-2 border-t border-border px-3 py-3">
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          disabled={!dirty || saving}
          onClick={() => onChange(baselineHtml)}
        >
          Reset
        </Button>
        <Button
          type="button"
          variant="primary"
          className="rounded-full"
          disabled={!dirty || saving}
          onClick={save}
          data-attr="lease-document-save"
        >
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
