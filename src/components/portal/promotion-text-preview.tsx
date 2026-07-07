"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { PortalCollapsibleSection } from "@/components/portal/portal-collapsible-section";
import { PromotionEntryEditableTitle } from "@/components/portal/promotion-entry-title";
import {
  PROMOTION_TEXT_FORMAT_OPTIONS,
  formatPromotionTextPlain,
  promotionTextEntryDisplayTitle,
  promotionTextFromPlain,
  type PromotionTextCopy,
  type PromotionTextEntry,
} from "@/lib/promotion-text";

export function PromotionTextPreview({ copy }: { copy: PromotionTextCopy }) {
  const formatLabel =
    PROMOTION_TEXT_FORMAT_OPTIONS.find((o) => o.id === copy.format)?.label ?? "Promotion text";
  const plain = formatPromotionTextPlain(copy);

  return (
    <div className="px-4 pb-4">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{formatLabel}</p>
      <pre className="whitespace-pre-wrap rounded-xl border border-border bg-accent/20 p-4 text-sm leading-relaxed text-foreground">
        {plain}
      </pre>
    </div>
  );
}

export async function copyPromotionTextToClipboard(copy: PromotionTextCopy): Promise<boolean> {
  const plain = formatPromotionTextPlain(copy);
  try {
    await navigator.clipboard.writeText(plain);
    return true;
  } catch {
    return false;
  }
}

export function PromotionTextCopyButton({
  copy,
  onCopied,
  className,
}: {
  copy: PromotionTextCopy;
  onCopied?: () => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className={className ?? "h-8 rounded-full px-4 text-xs"}
      data-attr="promotion-text-copy"
      onClick={() => {
        void copyPromotionTextToClipboard(copy).then((ok) => {
          if (ok) onCopied?.();
        });
      }}
    >
      Copy text
    </Button>
  );
}

/**
 * One promotion text rendered as a collapsible "dropdown box": the format label
 * and Copy / Regenerate / Delete buttons sit in the header; the body shows the
 * text read-only until you double-click it, which opens an inline editor that
 * auto-saves on blur.
 */
export function PromotionTextEntryEditor({
  entry,
  index,
  onSave,
  onDelete,
  onRegenerate,
  regenerating,
  showToast,
  defaultExpanded = false,
}: {
  entry: PromotionTextEntry;
  index: number;
  onSave: (entry: PromotionTextEntry) => void;
  onDelete: (id: string) => void;
  onRegenerate?: (id: string) => void;
  regenerating?: boolean;
  showToast?: (message: string) => void;
  defaultExpanded?: boolean;
}) {
  const formatLabel =
    PROMOTION_TEXT_FORMAT_OPTIONS.find((o) => o.id === entry.copy.format)?.label ?? "Promotion text";
  const displayTitle = promotionTextEntryDisplayTitle(entry, index);
  const [editing, setEditing] = useState(false);
  const [plain, setPlain] = useState(() => formatPromotionTextPlain(entry.copy));

  useEffect(() => {
    setPlain(formatPromotionTextPlain(entry.copy));
    setEditing(false);
  }, [entry.id, entry.updatedAt, entry.copy]);

  function commit() {
    setEditing(false);
    if (plain === formatPromotionTextPlain(entry.copy)) return;
    onSave({
      ...entry,
      copy: promotionTextFromPlain(plain, entry.copy),
      updatedAt: new Date().toISOString(),
    });
    showToast?.("Text saved.");
  }

  function saveTitle(title: string) {
    if (title === (entry.title?.trim() || displayTitle)) return;
    onSave({
      ...entry,
      title,
      updatedAt: new Date().toISOString(),
    });
    showToast?.("Name saved.");
  }

  return (
    <PortalCollapsibleSection
      title={
        <PromotionEntryEditableTitle
          value={entry.title ?? ""}
          fallback={promotionTextEntryDisplayTitle(entry, index)}
          onSave={saveTitle}
        />
      }
      subtitle={formatLabel}
      titleVariant="label"
      defaultExpanded={defaultExpanded}
      surfaceMuted={false}
      contentClassName="p-0 pt-0"
      toggleDataAttr="promotion-text-toggle"
      headerActions={
        <>
          <Button
            type="button"
            variant="outline"
            className="h-8 rounded-full px-3 text-xs"
            data-attr="promotion-text-copy"
            onClick={() => {
              const copy = editing ? promotionTextFromPlain(plain, entry.copy) : entry.copy;
              void copyPromotionTextToClipboard(copy).then((ok) => {
                if (ok) showToast?.("Copied to clipboard.");
              });
            }}
          >
            Copy
          </Button>
          {onRegenerate ? (
            <Button
              type="button"
              variant="outline"
              className="h-8 rounded-full px-3 text-xs"
              data-attr="promotion-text-regenerate-entry"
              disabled={regenerating}
              onClick={() => onRegenerate(entry.id)}
            >
              {regenerating ? "Regenerating…" : "Regenerate"}
            </Button>
          ) : null}
          <button
            type="button"
            aria-label="Delete promotion text"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-accent hover:text-foreground"
            data-attr="promotion-text-delete"
            onClick={() => onDelete(entry.id)}
          >
            ×
          </button>
        </>
      }
    >
      {editing ? (
        <Textarea
          autoFocus
          className="min-h-[12rem] resize-y rounded-none border-0 bg-accent/10 px-4 py-3 text-sm leading-relaxed shadow-none focus-visible:ring-0"
          value={plain}
          onChange={(e) => setPlain(e.target.value)}
          onBlur={commit}
          aria-label={`Edit ${formatLabel}`}
        />
      ) : (
        <pre
          className="m-0 cursor-text whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed text-foreground"
          title="Double-click to edit"
          onDoubleClick={() => setEditing(true)}
        >
          {plain || "Double-click to add text."}
        </pre>
      )}
    </PortalCollapsibleSection>
  );
}

export function PromotionTextEntriesList({
  entries,
  onSave,
  onDelete,
  onRegenerate,
  regeneratingId,
  showToast,
}: {
  entries: PromotionTextEntry[];
  onSave: (entry: PromotionTextEntry) => void;
  onDelete: (id: string) => void;
  onRegenerate?: (id: string) => void;
  regeneratingId?: string | null;
  showToast?: (message: string) => void;
}) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {entries.map((entry, index) => (
        <PromotionTextEntryEditor
          key={entry.id}
          entry={entry}
          index={index}
          defaultExpanded={index === 0}
          onSave={onSave}
          onDelete={onDelete}
          onRegenerate={onRegenerate}
          regenerating={regeneratingId === entry.id}
          showToast={showToast}
        />
      ))}
    </div>
  );
}
