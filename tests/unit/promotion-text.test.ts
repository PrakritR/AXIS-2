import { describe, expect, it } from "vitest";
import {
  composeFallbackPromotionText,
  formatPromotionTextPlain,
  normalizePromotionTextFormat,
} from "@/lib/promotion-text";
import type { PromotionInputs } from "@/lib/promotion-flyer";

const inputs: PromotionInputs = {
  headline: "Bright loft living",
  sellingPoints: "Rooftop deck\nIn-unit laundry",
  price: "$2,400/mo",
  promo: "First month free",
  cta: "Book a tour",
  contact: "leasing@example.com",
  tone: "Warm & welcoming",
  address: "123 Main St",
  customDetails: "",
};

describe("promotion-text", () => {
  it("normalizes unknown formats to listing blurb", () => {
    expect(normalizePromotionTextFormat("invalid")).toBe("listing_blurb");
    expect(normalizePromotionTextFormat("sms")).toBe("sms");
  });

  it("composes fallback email with subject line", () => {
    const copy = composeFallbackPromotionText(inputs, "SoMa Loft", "email_blast");
    expect(copy.subjectLine).toContain("Now leasing");
    expect(copy.body).toContain("Book a tour");
    expect(formatPromotionTextPlain(copy)).toContain("Subject:");
  });

  it("composes fallback sms under length cap", () => {
    const copy = composeFallbackPromotionText(inputs, "SoMa Loft", "sms");
    expect(copy.body.length).toBeLessThanOrEqual(300);
  });
});
