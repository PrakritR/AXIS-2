"use client";

import { Button } from "@/components/ui/button";
import { PromotionFlyerPreview, downloadPromotionFlyer } from "@/components/portal/promotion-flyer-preview";
import {
  PromotionTextEntryBody,
  copyPromotionTextToClipboard,
} from "@/components/portal/promotion-text-preview";
import {
  flyerRowForEntry,
  type ManagerPromotionRow,
} from "@/lib/promotion-flyer";
import type { PromotionAsset } from "@/lib/promotion-assets";
import type { PromotionTextEntry } from "@/lib/promotion-text";

const PROMOTION_ROW_ACTION_BUTTON_CLASS = "h-8 rounded-full px-3 text-xs";

export function PromotionFlyerHeaderActions({
  asset,
  onEdit,
  onDelete,
  canDelete,
}: {
  asset: PromotionAsset;
  onEdit: (row: ManagerPromotionRow, entryId: string) => void;
  onDelete: (row: ManagerPromotionRow, entryId: string) => void;
  canDelete: boolean;
}) {
  const entry = asset.flyerEntry;
  if (!entry) return null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={PROMOTION_ROW_ACTION_BUTTON_CLASS}
        onClick={() => downloadPromotionFlyer(flyerRowForEntry(asset.row, entry))}
        data-attr="promotion-flyer-download"
      >
        Download
      </Button>
      <Button
        type="button"
        variant="outline"
        className={PROMOTION_ROW_ACTION_BUTTON_CLASS}
        onClick={() => onEdit(asset.row, entry.id)}
        data-attr="promotion-edit"
      >
        Edit
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
    </>
  );
}

export function PromotionTextHeaderActions({
  asset,
  onEdit,
  onDelete,
  editing,
  showToast,
}: {
  asset: PromotionAsset;
  onEdit: (row: ManagerPromotionRow, entryId: string) => void;
  onDelete: (row: ManagerPromotionRow, entryId: string) => void;
  editing?: boolean;
  showToast?: (message: string) => void;
}) {
  const entry = asset.textEntry;
  if (!entry) return null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={PROMOTION_ROW_ACTION_BUTTON_CLASS}
        data-attr="promotion-text-copy"
        onClick={() => {
          void copyPromotionTextToClipboard(entry.copy).then((ok) => {
            if (ok) showToast?.("Copied to clipboard.");
          });
        }}
      >
        Copy
      </Button>
      <Button
        type="button"
        variant="outline"
        className={PROMOTION_ROW_ACTION_BUTTON_CLASS}
        data-attr="promotion-text-edit"
        disabled={editing}
        onClick={() => onEdit(asset.row, entry.id)}
      >
        {editing ? "Editing…" : "Edit"}
      </Button>
      <button
        type="button"
        aria-label="Delete promotion text"
        className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-accent hover:text-foreground"
        data-attr="promotion-text-delete"
        onClick={() => onDelete(asset.row, entry.id)}
      >
        ×
      </button>
    </>
  );
}

export function PromotionFlyerAssetDetail({ asset }: { asset: PromotionAsset }) {
  const entry = asset.flyerEntry;
  if (!entry) return null;

  return (
    <div className="min-w-0 overflow-x-auto rounded-xl border border-border bg-card">
      <PromotionFlyerPreview
        key={`${entry.id}-${entry.updatedAt}`}
        promotion={flyerRowForEntry(asset.row, entry)}
        embedded
      />
    </div>
  );
}

export function PromotionTextAssetDetail({
  asset,
  onSave,
  showToast,
}: {
  asset: PromotionAsset;
  onSave: (row: ManagerPromotionRow, entry: PromotionTextEntry) => void;
  showToast?: (message: string) => void;
}) {
  const entry = asset.textEntry;
  if (!entry) return null;

  return (
    <PromotionTextEntryBody
      entry={entry}
      onSave={(next) => onSave(asset.row, next)}
      showToast={showToast}
    />
  );
}
