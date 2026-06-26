import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/stripe", () => ({
  getStripe: vi.fn(),
}));

import { getStripe } from "@/lib/stripe";
import {
  normalizeOnboardDiscountPercent,
  stripeCouponIdForOnboardDiscount,
} from "@/lib/stripe-onboard-discount";

describe("normalizeOnboardDiscountPercent", () => {
  it("accepts 1-100", () => {
    expect(normalizeOnboardDiscountPercent(20)).toBe(20);
    expect(normalizeOnboardDiscountPercent("100")).toBe(100);
  });

  it("rejects invalid values", () => {
    expect(normalizeOnboardDiscountPercent(0)).toBeNull();
    expect(normalizeOnboardDiscountPercent(101)).toBeNull();
    expect(normalizeOnboardDiscountPercent("")).toBeNull();
    expect(normalizeOnboardDiscountPercent(null)).toBeNull();
  });
});

describe("stripeCouponIdForOnboardDiscount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reuses an existing valid coupon", async () => {
    const retrieve = vi.fn().mockResolvedValue({ id: "AXIS_ONBOARD_20_ONCE", valid: true });
    const create = vi.fn();
    vi.mocked(getStripe).mockReturnValue({
      coupons: { retrieve, create },
    } as never);

    const id = await stripeCouponIdForOnboardDiscount(20, "once");
    expect(id).toBe("AXIS_ONBOARD_20_ONCE");
    expect(create).not.toHaveBeenCalled();
  });

  it("creates a coupon when missing", async () => {
    const retrieve = vi.fn().mockRejectedValue(new Error("not found"));
    const create = vi.fn().mockResolvedValue({ id: "AXIS_ONBOARD_35_ONCE" });
    vi.mocked(getStripe).mockReturnValue({
      coupons: { retrieve, create },
    } as never);

    const id = await stripeCouponIdForOnboardDiscount(35, "once");
    expect(id).toBe("AXIS_ONBOARD_35_ONCE");
    expect(create).toHaveBeenCalledWith({
      id: "AXIS_ONBOARD_35_ONCE",
      percent_off: 35,
      duration: "once",
      name: "Axis onboard 35% off (once)",
    });
  });

  it("rejects 0 and 100 percent for Stripe coupons", async () => {
    await expect(stripeCouponIdForOnboardDiscount(0)).rejects.toThrow(/between 1 and 99/);
    await expect(stripeCouponIdForOnboardDiscount(100)).rejects.toThrow(/between 1 and 99/);
  });
});
