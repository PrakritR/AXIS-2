/**
 * Flatten promotion rows into individual flyer/text assets for stacked list UI.
 */

import {
  defaultFlyerEntryTitle,
  flyerEntryDisplayTitle,
  readFlyerEntries,
  type FlyerEntry,
  type ManagerPromotionRow,
} from "@/lib/promotion-flyer";
import {
  defaultPromotionTextEntryTitle,
  PROMOTION_TEXT_FORMAT_OPTIONS,
  promotionTextEntryDisplayTitle,
  readPromotionTextEntries,
  type PromotionTextEntry,
} from "@/lib/promotion-text";

export type PromotionAssetKind = "flyer" | "text";

export type PromotionAsset = {
  /** Stable expand key: `${rowId}::flyer::${entryId}` or `${rowId}::text::${entryId}` */
  id: string;
  kind: PromotionAssetKind;
  row: ManagerPromotionRow;
  flyerEntry?: FlyerEntry;
  textEntry?: PromotionTextEntry;
  propertyLabel: string;
  propertyId: string | null;
  /** Primary subtitle line (headline preview or channel/format). */
  subtitle: string;
  createdAt: string;
};

export type PromotionAssetSortMode = "property" | "newest";

export function makePromotionAssetId(
  rowId: string,
  kind: PromotionAssetKind,
  entryId: string,
): string {
  return `${rowId}::${kind}::${entryId}`;
}

function flyerAssetSubtitle(entry: FlyerEntry, index: number): string {
  const headline = entry.copy?.headline?.trim();
  if (headline) return headline;
  return flyerEntryDisplayTitle(entry, index);
}

function textAssetSubtitle(entry: PromotionTextEntry, index: number): string {
  const formatLabel =
    PROMOTION_TEXT_FORMAT_OPTIONS.find((o) => o.id === entry.copy.format)?.label ?? "Promotion text";
  const hook = entry.copy.hook?.trim();
  if (hook) return `${formatLabel} · ${hook}`;
  return formatLabel;
}

/** Expand all flyer and text entries from promotion rows into a flat asset list. */
export function flattenPromotionAssets(rows: ManagerPromotionRow[]): PromotionAsset[] {
  const assets: PromotionAsset[] = [];

  for (const row of rows) {
    const propertyLabel = row.propertyLabel?.trim() || "—";

    readFlyerEntries(row).forEach((entry, index) => {
      assets.push({
        id: makePromotionAssetId(row.id, "flyer", entry.id),
        kind: "flyer",
        row,
        flyerEntry: entry,
        propertyLabel,
        propertyId: row.propertyId,
        subtitle: flyerAssetSubtitle(entry, index),
        createdAt: entry.createdAt || row.createdAt,
      });
    });

    readPromotionTextEntries(row).forEach((entry, index) => {
      assets.push({
        id: makePromotionAssetId(row.id, "text", entry.id),
        kind: "text",
        row,
        textEntry: entry,
        propertyLabel,
        propertyId: row.propertyId,
        subtitle: textAssetSubtitle(entry, index),
        createdAt: entry.createdAt || row.updatedAt || row.createdAt,
      });
    });
  }

  return assets;
}

/**
 * Sort promotion assets. Default: property name A→Z, then newest created first
 * within the same property.
 */
export function sortPromotionAssets(
  assets: PromotionAsset[],
  mode: PromotionAssetSortMode = "property",
): PromotionAsset[] {
  if (mode === "newest") {
    return [...assets].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  return [...assets].sort((a, b) => {
    const byProperty = a.propertyLabel.localeCompare(b.propertyLabel, undefined, {
      sensitivity: "base",
    });
    if (byProperty !== 0) return byProperty;
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });
}

/** Box title on the property portal (asset-first; property is implicit). */
export function promotionAssetBoxTitle(asset: PromotionAsset, indexWithinKind: number): string {
  if (asset.kind === "flyer" && asset.flyerEntry) {
    return flyerEntryDisplayTitle(asset.flyerEntry, indexWithinKind);
  }
  if (asset.kind === "text" && asset.textEntry) {
    return promotionTextEntryDisplayTitle(asset.textEntry, indexWithinKind);
  }
  return asset.kind === "flyer" ? "Flyer" : "Promotion text";
}

/** Kind badge label for stacked cards. */
export function promotionAssetKindLabel(kind: PromotionAssetKind): string {
  return kind === "flyer" ? "Flyer" : "Text";
}

/** Default numbered label for the next asset of a kind (1-based sequence). */
export function nextPromotionAssetDefaultTitle(
  assets: PromotionAsset[],
  kind: PromotionAssetKind,
): string {
  const count = assets.filter((a) => a.kind === kind).length;
  return kind === "flyer" ? defaultFlyerEntryTitle(count + 1) : defaultPromotionTextEntryTitle(count + 1);
}

/** Per-kind sequence numbers for a sorted asset list (Flyer 1, Text 1, Flyer 2, …). */
export function promotionAssetKindIndices(assets: PromotionAsset[]): Map<string, number> {
  const counts: Record<PromotionAssetKind, number> = { flyer: 0, text: 0 };
  const indices = new Map<string, number>();
  for (const asset of assets) {
    const index = counts[asset.kind]++;
    indices.set(asset.id, index);
  }
  return indices;
}

/** List-row title: manager label when set, otherwise numbered Flyer N / Text N. */
export function promotionAssetListTitle(asset: PromotionAsset, indexWithinKind: number): string {
  if (asset.kind === "flyer" && asset.flyerEntry) {
    return flyerEntryDisplayTitle(asset.flyerEntry, indexWithinKind);
  }
  if (asset.kind === "text" && asset.textEntry) {
    return promotionTextEntryDisplayTitle(asset.textEntry, indexWithinKind);
  }
  return promotionAssetKindLabel(asset.kind);
}
