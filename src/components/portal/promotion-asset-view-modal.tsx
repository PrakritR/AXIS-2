"use client";

import { Modal } from "@/components/ui/modal";
import {
  PromotionFlyerAssetDetail,
  PromotionUploadAssetDetail,
} from "@/components/portal/promotion-asset-detail";
import { PromotionTextPreview } from "@/components/portal/promotion-text-preview";
import {
  promotionAssetBoxTitle,
  promotionAssetKindIndices,
  promotionAssetListTitle,
  type PromotionAsset,
} from "@/lib/promotion-assets";

function promotionKindLabel(kind: PromotionAsset["kind"]): string {
  if (kind === "flyer") return "Flyer";
  if (kind === "text") return "Text";
  return "Upload";
}

function viewTitle(asset: PromotionAsset, indexWithinKind: number): string {
  const stored =
    asset.kind === "flyer"
      ? (asset.flyerEntry?.title ?? "")
      : asset.kind === "upload"
        ? (asset.uploadEntry?.title ?? "")
        : (asset.textEntry?.title ?? "");
  const fallback = promotionAssetListTitle(asset, indexWithinKind);
  return stored.trim() || fallback;
}

export function PromotionAssetViewModal({
  asset,
  open,
  onClose,
  allAssets,
  dataAttr = "promotion-preview",
}: {
  asset: PromotionAsset | null;
  open: boolean;
  onClose: () => void;
  /** Used to resolve per-kind numbering in the title; pass the full list when available. */
  allAssets?: PromotionAsset[];
  dataAttr?: string;
}) {
  const indices = promotionAssetKindIndices(allAssets ?? (asset ? [asset] : []));
  const indexWithinKind = asset ? indices.get(asset.id) ?? 0 : 0;
  const title = asset ? `View · ${viewTitle(asset, indexWithinKind)}` : "View";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      presentation="dialog"
      dense
      assistantStrip={false}
      panelClassName="flex max-h-[min(90vh,56rem)] w-full max-w-5xl flex-col"
      dataAttr={dataAttr}
    >
      {open && asset ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <p className="mb-3 text-xs text-muted">
            {asset.propertyLabel} · {promotionKindLabel(asset.kind)} · {asset.subtitle}
          </p>
          {asset.kind === "flyer" ? (
            <PromotionFlyerAssetDetail asset={asset} />
          ) : asset.kind === "text" && asset.textEntry ? (
            <PromotionTextPreview copy={asset.textEntry.copy} />
          ) : asset.kind === "upload" ? (
            <PromotionUploadAssetDetail asset={asset} />
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}

/** Title for property-scoped lists (uses promotionAssetBoxTitle). */
export function promotionPropertyViewTitle(asset: PromotionAsset, indexWithinKind: number): string {
  return `View · ${promotionAssetBoxTitle(asset, indexWithinKind)}`;
}
