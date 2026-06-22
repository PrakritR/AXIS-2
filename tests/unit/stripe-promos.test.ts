import { describe, expect, it } from "vitest";
import {
  PRO_MONTHLY_FIRST_FREE_PROMO_CODE,
  normalizeProMonthlyPromoInput,
} from "@/lib/stripe-promos";

describe("stripe-promos", () => {
  it("normalizes promo aliases to FREEFIRST", () => {
    expect(normalizeProMonthlyPromoInput("firstfree")).toBe(PRO_MONTHLY_FIRST_FREE_PROMO_CODE);
    expect(normalizeProMonthlyPromoInput("FREEFIRST")).toBe(PRO_MONTHLY_FIRST_FREE_PROMO_CODE);
    expect(normalizeProMonthlyPromoInput("  ")).toBe("");
    expect(normalizeProMonthlyPromoInput("CUSTOM")).toBe("CUSTOM");
  });
});
