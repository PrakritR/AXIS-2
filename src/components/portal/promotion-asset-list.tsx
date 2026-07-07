"use client";

import { type ReactNode } from "react";
import {
  PORTAL_MOBILE_CARD_CLASS,
  PortalDataTableEmpty,
  PortalTableInlineExpand,
} from "@/components/portal/portal-data-table";
import { PromotionEntryEditableTitle } from "@/components/portal/promotion-entry-title";
import {
  promotionAssetKindIndices,
  promotionAssetListTitle,
  type PromotionAsset,
} from "@/lib/promotion-assets";

export function PromotionAssetStack({
  assets,
  expandedId,
  onToggleExpand,
  renderExpanded,
  renderHeaderActions,
  onSaveTitle,
  emptyMessage = "No promotions yet.",
}: {
  assets: PromotionAsset[];
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  renderExpanded: (asset: PromotionAsset, indexWithinKind: number) => ReactNode;
  renderHeaderActions?: (asset: PromotionAsset, indexWithinKind: number) => ReactNode;
  onSaveTitle?: (asset: PromotionAsset, title: string, indexWithinKind: number) => void;
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
        const isOpen = expandedId === asset.id;
        const fallbackTitle = promotionAssetListTitle(asset, indexWithinKind);
        const storedTitle =
          asset.kind === "flyer"
            ? (asset.flyerEntry?.title ?? "")
            : (asset.textEntry?.title ?? "");

        return (
          <div key={asset.id} className={PORTAL_MOBILE_CARD_CLASS}>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={() => onToggleExpand(asset.id)}
                aria-expanded={isOpen}
                data-attr="promotion-row"
              >
                <PortalTableInlineExpand expanded={isOpen} className="text-sm font-semibold text-foreground">
                  {onSaveTitle ? (
                    <PromotionEntryEditableTitle
                      value={storedTitle}
                      fallback={fallbackTitle}
                      onSave={(title) => onSaveTitle(asset, title, indexWithinKind)}
                      className="text-sm font-semibold normal-case tracking-normal text-foreground"
                      inputClassName="text-sm normal-case tracking-normal"
                    />
                  ) : (
                    <span className="truncate">{fallbackTitle}</span>
                  )}
                </PortalTableInlineExpand>
              </button>
              {renderHeaderActions ? (
                <div
                  className="flex shrink-0 flex-wrap items-center justify-end gap-1.5"
                  data-portal-row-ignore
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {renderHeaderActions(asset, indexWithinKind)}
                </div>
              ) : null}
            </div>
            {isOpen ? (
              <div className="mt-3 border-t border-border pt-3">
                {renderExpanded(asset, indexWithinKind)}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
