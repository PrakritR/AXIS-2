"use client";

import { Button } from "@/components/ui/button";
import {
  PORTAL_PROPERTY_DETAIL_ACTION_BUTTON_CLASS,
  PORTAL_PROPERTY_DETAIL_LIST_ROW_CLASS,
} from "@/components/portal/portal-property-detail-section";
import { PortalDataTableEmpty } from "@/components/portal/portal-data-table";
import {
  promotionAssetKindIndices,
  promotionAssetListTitle,
  type PromotionAsset,
} from "@/lib/promotion-assets";

function promotionKindLabel(kind: PromotionAsset["kind"]): string {
  if (kind === "flyer") return "Flyer";
  if (kind === "text") return "Text";
  return "Upload";
}

function rowTitle(asset: PromotionAsset, indexWithinKind: number): string {
  const stored =
    asset.kind === "flyer"
      ? (asset.flyerEntry?.title ?? "")
      : asset.kind === "upload"
        ? (asset.uploadEntry?.title ?? "")
        : (asset.textEntry?.title ?? "");
  return stored.trim() || promotionAssetListTitle(asset, indexWithinKind);
}

export function PromotionAssetStack({
  assets,
  onView,
  onEdit,
  emptyMessage = "No promotions yet.",
  showPropertyLabel = true,
  variant = "plain",
}: {
  assets: PromotionAsset[];
  onView: (asset: PromotionAsset) => void;
  onEdit?: (asset: PromotionAsset) => void;
  emptyMessage?: string;
  /** When false (property Promotion tab), the property name is omitted from the subtitle. */
  showPropertyLabel?: boolean;
  variant?: "card" | "plain";
}) {
  if (assets.length === 0) {
    if (!emptyMessage?.trim()) return null;
    return <PortalDataTableEmpty message={emptyMessage} icon="data" />;
  }

  const kindIndices = promotionAssetKindIndices(assets);

  const rows = assets.map((asset) => {
        const indexWithinKind = kindIndices.get(asset.id) ?? 0;
        const title = rowTitle(asset, indexWithinKind);
        const canEdit = Boolean(onEdit) && (asset.kind === "flyer" || asset.kind === "text");
        const subtitleParts = [
          showPropertyLabel ? asset.propertyLabel : null,
          promotionKindLabel(asset.kind),
          asset.subtitle,
        ].filter(Boolean);

        return (
          <div key={asset.id} className={PORTAL_PROPERTY_DETAIL_LIST_ROW_CLASS}>
            <div className="min-w-0 flex-1">
              <button
                type="button"
                className="min-w-0 text-left text-sm font-semibold text-foreground hover:underline"
                data-attr="promotion-row"
                onClick={() => onView(asset)}
              >
                {title}
              </button>
              <p className="mt-0.5 text-xs text-muted">{subtitleParts.join(" · ")}</p>
            </div>
            <div className="flex shrink-0 flex-nowrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className={PORTAL_PROPERTY_DETAIL_ACTION_BUTTON_CLASS}
                data-attr={`promotion-row-view-${asset.id}`}
                onClick={() => onView(asset)}
              >
                View
              </Button>
              {canEdit ? (
                <Button
                  type="button"
                  variant="outline"
                  className={PORTAL_PROPERTY_DETAIL_ACTION_BUTTON_CLASS}
                  data-attr={`promotion-row-edit-${asset.id}`}
                  onClick={() => onEdit?.(asset)}
                >
                  Edit
                </Button>
              ) : null}
            </div>
          </div>
        );
      });

  if (variant === "plain") {
    return <>{rows}</>;
  }

  return <div className="divide-y divide-border rounded-xl border border-border bg-card">{rows}</div>;
}
