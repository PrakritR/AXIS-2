"use client";

import { Modal } from "@/components/ui/modal";
import {
  PromotionFlyerAssetDetail,
  PromotionUploadAssetDetail,
} from "@/components/portal/promotion-asset-detail";
import { PromotionTextPreview } from "@/components/portal/promotion-text-preview";
import {
  promotionAssetKindIndices,
  promotionAssetListTitle,
  type PromotionAsset,
} from "@/lib/promotion-assets";

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
        <div className="mx-auto min-h-0 w-full max-w-5xl flex-1 overflow-y-auto">
          {asset.kind === "flyer" ? (
            <PromotionFlyerAssetDetail asset={asset} />
          ) : asset.kind === "text" && asset.textEntry ? (
            <PromotionTextPreview copy={asset.textEntry.copy} variant="plain" />
          ) : asset.kind === "upload" ? (
            <PromotionUploadAssetDetail asset={asset} />
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
