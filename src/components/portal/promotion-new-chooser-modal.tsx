"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/input";
import type { PromotionAssetKind } from "@/lib/promotion-assets";

const PROMOTION_KIND_OPTIONS: { id: PromotionAssetKind; label: string; description: string }[] = [
  { id: "flyer", label: "Flyer", description: "Printable or social-ready design." },
  { id: "text", label: "Text", description: "Caption, email, SMS, or listing blurb." },
];

export function PromotionNewChooserModal({
  open,
  onClose,
  onChoose,
}: {
  open: boolean;
  onClose: () => void;
  onChoose: (kind: PromotionAssetKind) => void;
}) {
  const [kind, setKind] = useState<PromotionAssetKind>("flyer");

  // Reset on each open so a previous pick never silently persists.
  useEffect(() => {
    if (open) setKind("flyer");
  }, [open]);

  const selected = PROMOTION_KIND_OPTIONS.find((o) => o.id === kind);

  return (
    <Modal open={open} title="New promotion" onClose={onClose} panelClassName="max-w-md">
      <div className="text-sm">
        <label className="text-xs font-semibold text-muted" htmlFor="promotion-new-kind">
          Promotion type
        </label>
        <Select
          id="promotion-new-kind"
          className="mt-1"
          value={kind}
          onChange={(e) => setKind(e.target.value as PromotionAssetKind)}
          data-attr="promotion-new-kind"
        >
          {PROMOTION_KIND_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </Select>
        {selected ? <p className="mt-1.5 text-xs text-muted">{selected.description}</p> : null}
      </div>

      <div className="mt-4 flex justify-start gap-2">
        <Button
          type="button"
          onClick={() => onChoose(kind)}
          data-attr={kind === "flyer" ? "promotion-new-flyer" : "promotion-new-text"}
        >
          Continue
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
