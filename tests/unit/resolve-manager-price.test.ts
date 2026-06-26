import { afterEach, describe, expect, it, vi } from "vitest";
import { clearManagerPriceCache, resolveStripePriceIdForPaidTier } from "@/lib/stripe/resolve-manager-price";

const listPrices = vi.fn();
const listProducts = vi.fn();

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    prices: { list: listPrices },
    products: { list: listProducts },
  }),
}));

describe("resolveStripePriceIdForPaidTier", () => {
  afterEach(() => {
    clearManagerPriceCache();
    listPrices.mockReset();
    listProducts.mockReset();
    delete process.env.STRIPE_PRICE_PRO_MONTHLY;
    delete process.env.STRIPE_PRICE_PRO_ANNUAL;
  });

  it("uses env override when it is a price id", async () => {
    process.env.STRIPE_PRICE_PRO_MONTHLY = "price_env_pro_monthly";
    await expect(resolveStripePriceIdForPaidTier("pro", "monthly")).resolves.toBe("price_env_pro_monthly");
    expect(listPrices).not.toHaveBeenCalled();
  });

  it("ignores numeric env values and resolves by lookup_key", async () => {
    process.env.STRIPE_PRICE_PRO_MONTHLY = "20";
    listPrices.mockResolvedValueOnce({ data: [{ id: "price_lookup_pro_monthly" }] });
    await expect(resolveStripePriceIdForPaidTier("pro", "monthly")).resolves.toBe("price_lookup_pro_monthly");
    expect(listPrices).toHaveBeenCalledWith(
      expect.objectContaining({ lookup_keys: ["axis_manager_pro_monthly"] }),
    );
  });

  it("falls back to product metadata axis_plan", async () => {
    listPrices
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [{ id: "price_meta_pro_annual", recurring: { interval: "year" }, type: "recurring" }] });
    listProducts.mockResolvedValueOnce({ data: [{ id: "prod_pro", metadata: { axis_plan: "axis_pro" } }] });

    await expect(resolveStripePriceIdForPaidTier("pro", "annual")).resolves.toBe("price_meta_pro_annual");
  });
});
