import { describe, expect, it } from "vitest";
import { defaultFlyerEntryTitle, flyerEntryDisplayTitle, type FlyerEntry } from "@/lib/promotion-flyer";
import {
  composeFallbackPromotionText,
  createPromotionTextEntry,
  defaultPromotionTextEntryTitle,
  formatPromotionTextPlain,
  normalizePromotionTextFormat,
  promotionTextEntryDisplayTitle,
  promotionTextFromPlain,
  readPromotionTextEntries,
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

  it("migrates legacy textCopy into textCopies entries", () => {
    const copy = composeFallbackPromotionText(inputs, "SoMa Loft", "listing_blurb");
    const entries = readPromotionTextEntries({ textCopy: copy });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.copy.format).toBe("listing_blurb");
  });

  it("reads multiple textCopies entries", () => {
    const a = createPromotionTextEntry(composeFallbackPromotionText(inputs, "SoMa Loft", "sms"));
    const b = createPromotionTextEntry(composeFallbackPromotionText(inputs, "SoMa Loft", "listing_blurb"));
    const entries = readPromotionTextEntries({ textCopies: [a, b] });
    expect(entries).toHaveLength(2);
  });

  it("round-trips plain text edits for listing blurbs", () => {
    const copy = composeFallbackPromotionText(inputs, "SoMa Loft", "listing_blurb");
    const plain = "New hook line.\n\nUpdated body copy.\n\nBook a tour today.";
    const next = promotionTextFromPlain(plain, copy);
    expect(next.hook).toBe("New hook line.");
    expect(next.body).toBe("Updated body copy.");
    expect(next.ctaLine).toBe("Book a tour today.");
    expect(formatPromotionTextPlain(next)).toContain("Updated body copy.");
  });

  it("defaults text entry titles to Text 1, Text 2", () => {
    const copy = composeFallbackPromotionText(inputs, "SoMa Loft", "listing_blurb");
    const first = createPromotionTextEntry(copy, defaultPromotionTextEntryTitle(1));
    const second = createPromotionTextEntry(copy, defaultPromotionTextEntryTitle(2));
    expect(first.title).toBe("Text 1");
    expect(second.title).toBe("Text 2");
    expect(promotionTextEntryDisplayTitle(first, 0)).toBe("Text 1");
    expect(promotionTextEntryDisplayTitle({ title: "My blurb" }, 1)).toBe("My blurb");
    expect(promotionTextEntryDisplayTitle({ title: "" }, 1)).toBe("Text 2");
  });

  it("defaults flyer entry display titles to Flyer 1, Flyer 2", () => {
    const base = {
      copy: {
        headline: "Headline",
        subheadline: "Sub",
        sellingPoints: [],
        promoLine: "",
        ctaText: "CTA",
        closingLine: "Close",
      },
      template: "showcase" as const,
      theme: "cobalt" as const,
      flyerSize: "letter" as const,
      inputs,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const first: FlyerEntry = { id: "f1", title: defaultFlyerEntryTitle(1), ...base };
    const second: FlyerEntry = { id: "f2", title: defaultFlyerEntryTitle(2), ...base };
    expect(flyerEntryDisplayTitle(first, 0)).toBe("Flyer 1");
    expect(flyerEntryDisplayTitle(second, 1)).toBe("Flyer 2");
    expect(flyerEntryDisplayTitle({ ...first, title: "Spring special" }, 0)).toBe("Spring special");
    expect(flyerEntryDisplayTitle({ ...first, title: "" }, 0)).toBe("Flyer 1");
  });

  it("persists custom text entry titles through readPromotionTextEntries", () => {
    const copy = composeFallbackPromotionText(inputs, "SoMa Loft", "listing_blurb");
    const entry = createPromotionTextEntry(copy, "Custom name");
    const entries = readPromotionTextEntries({ textCopies: [entry] });
    expect(entries[0]?.title).toBe("Custom name");
  });
});
