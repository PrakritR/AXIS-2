"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { sanitizeLeaseDocumentHtml } from "@/lib/lease-document-sanitizer";
import { saveLeaseDocumentHtml } from "@/lib/lease-section-edit.client";
import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";
import { cn } from "@/lib/utils";

type Props = {
  row: LeasePipelineRow;
  managerUserId?: string | null;
  html: string;
  baselineHtml: string;
  onChange: (html: string) => void;
  onSaved: (row: LeasePipelineRow) => void;
  className?: string;
};

/**
 * Intentionally a source editor, not a rich-text surface. The preview uses
 * exactly the same allowlist that is enforced before storage and never grants
 * scripts or same-origin access to manager-authored content.
 */
export function LeaseDocumentDirectEditor({
  row,
  managerUserId,
  html,
  baselineHtml,
  onChange,
  onSaved,
  className,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = html.trim() !== baselineHtml.trim();
  const previewHtml = useMemo(() => sanitizeLeaseDocumentHtml(html) ?? "", [html]);

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
      <p className="shrink-0 border-b border-border px-3 py-2 text-xs text-muted">
        Edit the document HTML, then review the sanitized preview. Scripts, event handlers, links, and external content are removed when saved.
      </p>

      {error ? <p className="shrink-0 px-3 py-1.5 text-sm text-rose-700">{error}</p> : null}

      <div className="grid min-h-0 flex-1 grid-rows-2 divide-y divide-border bg-white md:grid-cols-2 md:grid-rows-1 md:divide-x md:divide-y-0">
        <Textarea
          value={html}
          onChange={(e) => onChange(e.target.value)}
          className="h-full min-h-0 resize-none rounded-none border-0 bg-white font-mono text-xs leading-relaxed shadow-none focus-visible:ring-0"
          aria-label="Lease HTML editor"
          data-attr="lease-document-html-editor"
        />
        <div className="relative min-h-0 overflow-hidden">
          <iframe
            title="Sanitized lease preview"
            srcDoc={previewHtml}
            sandbox=""
            className="absolute inset-0 h-full w-full border-0 bg-white"
          />
        </div>
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
