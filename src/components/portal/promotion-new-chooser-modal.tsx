"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/input";
import { CUSTOM_PROPERTY_KEY } from "@/components/portal/manager-promotion";
import type { ManagerPromotionPropertyOption } from "@/lib/manager-property-links";
import type { PromotionAssetKind } from "@/lib/promotion-assets";

export function PromotionNewChooserModal({
  open,
  onClose,
  listings,
  propertyKey,
  onPropertyKeyChange,
  hidePropertyPicker = false,
  onChoose,
}: {
  open: boolean;
  onClose: () => void;
  listings: ManagerPromotionPropertyOption[];
  propertyKey: string;
  onPropertyKeyChange: (key: string) => void;
  hidePropertyPicker?: boolean;
  onChoose: (kind: PromotionAssetKind) => void;
}) {
  const needsProperty =
    !hidePropertyPicker && propertyKey === CUSTOM_PROPERTY_KEY && listings.length > 0;

  return (
    <Modal open={open} title="New promotion" onClose={onClose} panelClassName="max-w-md">
      <p className="text-sm text-muted">Choose what you want to create for this listing.</p>

      {hidePropertyPicker ? null : (
        <div className="mt-4">
          <label className="text-xs font-semibold text-muted" htmlFor="promotion-new-property">
            Property / listing
          </label>
          <Select
            id="promotion-new-property"
            className="mt-1"
            value={propertyKey}
            onChange={(e) => onPropertyKeyChange(e.target.value)}
            data-attr="promotion-new-property"
          >
            <option value={CUSTOM_PROPERTY_KEY}>Select a property…</option>
            {listings.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </Select>
        </div>
      )}

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          className="h-auto flex-col items-start gap-1 rounded-2xl px-4 py-4 text-left"
          disabled={needsProperty}
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
          disabled={needsProperty}
          onClick={() => onChoose("text")}
          data-attr="promotion-new-text"
        >
          <span className="text-sm font-semibold text-foreground">Promotion text</span>
          <span className="text-xs font-normal text-muted">Caption, email, SMS, or listing blurb</span>
        </Button>
      </div>

      {needsProperty ? (
        <p className="mt-3 text-xs text-muted">Pick a property above to continue.</p>
      ) : null}

      <div className="mt-4 flex justify-end">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
