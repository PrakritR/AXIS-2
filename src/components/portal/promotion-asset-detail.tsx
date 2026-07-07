"use client";

import { Button } from "@/components/ui/button";
import { PromotionFlyerPreview, downloadPromotionFlyer } from "@/components/portal/promotion-flyer-preview";
import { PromotionTextEntryEditor } from "@/components/portal/promotion-text-preview";
import { PromotionEntryEditableTitle } from "@/components/portal/promotion-entry-title";
import {
  flyerEntryDisplayTitle,
  flyerRowForEntry,
  type ManagerPromotionRow,
} from "@/lib/promotion-flyer";
import type { PromotionAsset } from "@/lib/promotion-assets";
import type { PromotionTextEntry } from "@/lib/promotion-text";

export function PromotionFlyerAssetDetail({
  asset,
  index,
  onEdit,
  onRegenerate,
  onDelete,
  onSaveTitle,
  regenerating,
  canDelete,
}: {
  asset: PromotionAsset;
  index: number;
  onEdit: (row: ManagerPromotionRow, entryId: string) => void;
  onRegenerate: (row: ManagerPromotionRow, entryId: string) => void;
  onDelete: (row: ManagerPromotionRow, entryId: string) => void;
  onSaveTitle: (row: ManagerPromotionRow, entryId: string, title: string) => void;
  regenerating: boolean;
  canDelete: boolean;
}) {
  const entry = asset.flyerEntry;
  if (!entry) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PromotionEntryEditableTitle
          value={entry.title}
          fallback={flyerEntryDisplayTitle(entry, index)}
          onSave={(title) => onSaveTitle(asset.row, entry.id, title)}
          className="text-sm font-semibold text-foreground"
          inputClassName="text-sm normal-case tracking-normal"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            className="h-8 rounded-full px-3 text-xs"
            onClick={() => downloadPromotionFlyer(flyerRowForEntry(asset.row, entry))}
            data-attr="promotion-flyer-download"
          >
            Download
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-8 rounded-full px-3 text-xs"
            onClick={() => onEdit(asset.row, entry.id)}
            data-attr="promotion-edit"
          >
            Edit
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-8 rounded-full px-3 text-xs"
            onClick={() => onRegenerate(asset.row, entry.id)}
            disabled={regenerating}
            data-attr="promotion-regenerate"
          >
            {regenerating ? "Regenerating…" : "Regenerate"}
          </Button>
          {canDelete ? (
            <button
              type="button"
              aria-label="Delete flyer"
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-accent hover:text-foreground"
              data-attr="promotion-flyer-delete"
              onClick={() => onDelete(asset.row, entry.id)}
            >
              ×
            </button>
          ) : null}
        </div>
      </div>
      <div className="min-w-0 overflow-x-auto rounded-xl border border-border bg-card">
        <PromotionFlyerPreview
          key={`${entry.id}-${entry.updatedAt}`}
          promotion={flyerRowForEntry(asset.row, entry)}
          embedded
        />
      </div>
    </div>
  );
}

export function PromotionTextAssetDetail({
  asset,
  index,
  onSave,
  onDelete,
  onRegenerate,
  regenerating,
  showToast,
}: {
  asset: PromotionAsset;
  index: number;
  onSave: (row: ManagerPromotionRow, entry: PromotionTextEntry) => void;
  onDelete: (row: ManagerPromotionRow, entryId: string) => void;
  onRegenerate: (row: ManagerPromotionRow, entryId: string) => void;
  regenerating: boolean;
  showToast?: (message: string) => void;
}) {
  const entry = asset.textEntry;
  if (!entry) return null;

  return (
    <PromotionTextEntryEditor
      entry={entry}
      index={index}
      defaultExpanded
      onSave={(next) => onSave(asset.row, next)}
      onDelete={(entryId) => onDelete(asset.row, entryId)}
      onRegenerate={(entryId) => onRegenerate(asset.row, entryId)}
      regenerating={regenerating}
      showToast={showToast}
    />
  );
}
