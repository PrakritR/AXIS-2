"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { PromotionAssetKind } from "@/lib/promotion-assets";

export function PromotionNewChooserModal({
  open,
  onClose,
  onChoose,
}: {
  open: boolean;
  onClose: () => void;
  onChoose: (kind: PromotionAssetKind) => void;
}) {
  return (
    <Modal open={open} title="New promotion" onClose={onClose} panelClassName="max-w-md">
      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          className="h-auto flex-col items-start gap-1 rounded-2xl px-4 py-4 text-left"
          onClick={() => onChoose("flyer")}
          data-attr="promotion-new-flyer"
        >
          <span className="text-sm font-semibold text-foreground">Flyer</span>
          <span className="text-xs font-normal text-muted">Printable or social-ready design</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-auto flex-col items-start gap-1 rounded-2xl px-4 py-4 text-left"
          onClick={() => onChoose("text")}
          data-attr="promotion-new-text"
        >
          <span className="text-sm font-semibold text-foreground">Text</span>
          <span className="text-xs font-normal text-muted">Caption, email, SMS, or listing blurb</span>
        </Button>
      </div>

      <div className="mt-4 flex justify-end">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
