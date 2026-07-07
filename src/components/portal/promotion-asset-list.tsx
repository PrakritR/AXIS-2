"use client";

import { type ReactNode } from "react";
import {
  PortalDataTableEmpty,
  PortalMobileSummaryCard,
} from "@/components/portal/portal-data-table";
import {
  promotionAssetBoxTitle,
  promotionAssetKindLabel,
  type PromotionAsset,
} from "@/lib/promotion-assets";

function formatAssetDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function PromotionAssetStack({
  assets,
  expandedId,
  onToggleExpand,
  renderExpanded,
  showPropertyName = true,
  emptyMessage = "No promotions yet.",
}: {
  assets: PromotionAsset[];
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  renderExpanded: (asset: PromotionAsset) => ReactNode;
  showPropertyName?: boolean;
  emptyMessage?: string;
}) {
  if (assets.length === 0) {
    return <PortalDataTableEmpty message={emptyMessage} icon="data" />;
  }

  const kindIndex = new Map<string, number>();

  return (
    <div className="space-y-2">
      {assets.map((asset) => {
        const kindKey = `${asset.row.id}::${asset.kind}`;
        const indexWithinKind = kindIndex.get(kindKey) ?? 0;
        kindIndex.set(kindKey, indexWithinKind + 1);

        const isOpen = expandedId === asset.id;
        const title = showPropertyName
          ? asset.propertyLabel
          : promotionAssetBoxTitle(asset, indexWithinKind);
        const subtitle = showPropertyName ? asset.subtitle : promotionAssetKindLabel(asset.kind);
        const meta = `Created ${formatAssetDate(asset.createdAt)}`;

        return (
          <PortalMobileSummaryCard
            key={asset.id}
            title={title}
            subtitle={subtitle}
            meta={meta}
            expanded={isOpen}
            onClick={() => onToggleExpand(asset.id)}
            badge={
              showPropertyName ? (
                <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
                  {promotionAssetKindLabel(asset.kind)}
                </span>
              ) : undefined
            }
          >
            {isOpen ? renderExpanded(asset) : null}
          </PortalMobileSummaryCard>
        );
      })}
    </div>
  );
}
