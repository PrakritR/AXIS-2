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

/** Keep modal context on one line so `[Context: …]` parsing stays reliable. */
function singleLineField(value: string, maxLen: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLen);
}

/** Rich context line for the New promotion modal assistant strip. */
export function buildPromotionNewModalAssistantContext(
  draft: PromotionAssistantDraftSlice,
  kind: PromotionAssetKind,
): string {
  const parts = [`New promotion (${kind})`];
  if (draft.propertyKey && draft.propertyKey !== PROMOTION_CUSTOM_PROPERTY_KEY) {
    parts.push(`propertyId=${draft.propertyKey}`);
    if (draft.propertyLabel.trim()) parts.push(`property=${singleLineField(draft.propertyLabel, 80)}`);
  } else {
    parts.push("property=custom (no listing selected)");
  }
  if (draft.address.trim()) parts.push(`address=${singleLineField(draft.address, 120)}`);
  if (draft.headline.trim()) parts.push(`headline=${singleLineField(draft.headline, 100)}`);
  if (draft.price.trim()) parts.push(`price=${singleLineField(draft.price, 40)}`);
  if (draft.sellingPoints.trim()) {
    parts.push(`sellingPoints=${singleLineField(draft.sellingPoints, 120)}`);
  }
  if (draft.aiPrompt.trim()) parts.push(`styleNotes=${singleLineField(draft.aiPrompt, 160)}`);
  parts.push(
    "Manager may attach reference images or PDFs with the paperclip. Uploaded image URLs go in referenceImageUrls; read PDFs for copy and layout. Propose create_promotion or generate_promotion_flyer when the manager wants a flyer.",
  );
  return parts.join(" · ");
}
