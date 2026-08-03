"use client";

import { ChevronRight } from "lucide-react";
import { type ReactNode } from "react";
import {
  PORTAL_MOBILE_CARD_CLASS,
  PortalDataTableEmpty,
} from "@/components/portal/portal-data-table";
import { PortalSectionActionRow } from "@/components/portal/portal-section-action-row";
import {
  promotionAssetKindIndices,
  promotionAssetListTitle,
  type PromotionAsset,
} from "@/lib/promotion-assets";

export function PromotionAssetStack({
  assets,
  onOpen,
  renderHeaderActions,
  emptyMessage = "No promotions yet.",
}: {
  assets: PromotionAsset[];
  onOpen: (asset: PromotionAsset) => void;
  renderHeaderActions?: (asset: PromotionAsset, indexWithinKind: number) => ReactNode;
  emptyMessage?: string;
}) {
  if (assets.length === 0) {
    return <PortalDataTableEmpty message={emptyMessage} icon="data" />;
  }

  const kindIndices = promotionAssetKindIndices(assets);

  return (
    <div className="space-y-2">
      {assets.map((asset) => {
        const indexWithinKind = kindIndices.get(asset.id) ?? 0;
        const fallbackTitle = promotionAssetListTitle(asset, indexWithinKind);
        const storedTitle =
          asset.kind === "flyer"
            ? (asset.flyerEntry?.title ?? "")
            : asset.kind === "upload"
              ? (asset.uploadEntry?.title ?? "")
              : (asset.textEntry?.title ?? "");
        const displayTitle = storedTitle.trim() || fallbackTitle;

        return (
          <div key={asset.id} className={PORTAL_MOBILE_CARD_CLASS}>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={() => onOpen(asset)}
                data-attr="promotion-row"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                  {displayTitle}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted" strokeWidth={2.25} aria-hidden />
              </button>
              {renderHeaderActions ? (
                <div
                  data-portal-row-ignore
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <PortalSectionActionRow className="shrink-0 sm:w-auto">
                    {renderHeaderActions(asset, indexWithinKind)}
                  </PortalSectionActionRow>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
