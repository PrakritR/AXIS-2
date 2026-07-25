import type { PromotionAssetKind } from "@/lib/promotion-assets";

/** Minimal draft fields needed to scope the modal assistant. */
export type PromotionAssistantDraftSlice = {
  propertyKey: string;
  propertyLabel: string;
  address: string;
  headline: string;
  sellingPoints: string;
  price: string;
  aiPrompt: string;
};

export const PROMOTION_CUSTOM_PROPERTY_KEY = "__custom__";

/** Rich context line for the New promotion modal assistant strip. */
export function buildPromotionNewModalAssistantContext(
  draft: PromotionAssistantDraftSlice,
  kind: PromotionAssetKind,
): string {
  const parts = [`New promotion (${kind})`];
  if (draft.propertyKey && draft.propertyKey !== PROMOTION_CUSTOM_PROPERTY_KEY) {
    parts.push(`propertyId=${draft.propertyKey}`);
    if (draft.propertyLabel.trim()) parts.push(`property=${draft.propertyLabel.trim()}`);
  } else {
    parts.push("property=custom (no listing selected)");
  }
  if (draft.address.trim()) parts.push(`address=${draft.address.trim()}`);
  if (draft.headline.trim()) parts.push(`headline=${draft.headline.trim()}`);
  if (draft.price.trim()) parts.push(`price=${draft.price.trim()}`);
  if (draft.sellingPoints.trim()) parts.push(`sellingPoints=${draft.sellingPoints.trim().slice(0, 120)}`);
  if (draft.aiPrompt.trim()) parts.push(`styleNotes=${draft.aiPrompt.trim().slice(0, 160)}`);
  parts.push(
    "Propose create_promotion or generate_promotion_flyer when the manager wants a flyer; use propertyId above and referenceImageUrls from uploaded images.",
  );
  return parts.join(" · ");
}
