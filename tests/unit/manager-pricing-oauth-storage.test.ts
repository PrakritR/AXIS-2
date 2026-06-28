import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearManagerPricingOffer,
  persistManagerPricingOffer,
  readManagerPricingOffer,
} from "@/lib/auth/manager-pricing-oauth-storage";

describe("manager-pricing-oauth-storage", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips encoded pricing offers", () => {
    persistManagerPricingOffer({
      tier: "pro",
      billing: "annual",
      discountPercent: 10,
      promo: "SAVE10",
    });

    const raw = storage.get("axis:manager-pricing-offer");
    expect(raw).toBeTruthy();
    expect(raw).not.toContain("annual");
    expect(raw).not.toContain("billing");

    expect(readManagerPricingOffer()).toEqual({
      tier: "pro",
      billing: "annual",
      discountPercent: 10,
      promo: "SAVE10",
    });
  });

  it("clears stored offers", () => {
    persistManagerPricingOffer({ tier: "free", billing: "monthly" });
    clearManagerPricingOffer();
    expect(readManagerPricingOffer()).toBeNull();
  });
});
