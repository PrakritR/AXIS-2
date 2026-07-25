import { describe, expect, it } from "vitest";
import { buildPromotionNewModalAssistantContext } from "@/lib/promotion-assistant-context";
import { PROMOTION_CUSTOM_PROPERTY_KEY } from "@/lib/promotion-assistant-context";

describe("buildPromotionNewModalAssistantContext", () => {
  it("includes property id and labels from the draft", () => {
    const ctx = buildPromotionNewModalAssistantContext(
      {
        propertyKey: "mgr-ballard-1",
        propertyLabel: "Ballard House",
        address: "123 Main St",
        headline: "Bright room",
        sellingPoints: "Near transit",
        price: "$950/mo",
        aiPrompt: "Match the bold reference layout",
      },
      "flyer",
    );
    expect(ctx).toContain("propertyId=mgr-ballard-1");
    expect(ctx).toContain("property=Ballard House");
    expect(ctx).toContain("address=123 Main St");
    expect(ctx).toContain("styleNotes=Match the bold reference layout");
    expect(ctx).toContain("create_promotion");
  });

  it("marks custom promotions without a listing id", () => {
    const ctx = buildPromotionNewModalAssistantContext(
      {
        propertyKey: PROMOTION_CUSTOM_PROPERTY_KEY,
        propertyLabel: "",
        address: "",
        headline: "",
        sellingPoints: "",
        price: "",
        aiPrompt: "",
      },
      "text",
    );
    expect(ctx).toContain("custom (no listing selected)");
    expect(ctx).toContain("New promotion (text)");
  });
});
