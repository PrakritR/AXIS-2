import { describe, expect, it } from "vitest";
import {
  APPLE_IAP_LAUNCH_PRODUCT_IDS,
  appleManagerPurchaseSessionId,
  isAppleBilledManagerPurchase,
  isAppleManagedManagerPurchase,
  tierForAppleProductId,
} from "@/lib/manager-apple-purchase";

describe("manager-apple-purchase helpers", () => {
  describe("isAppleBilledManagerPurchase", () => {
    it("is true only with the apple billing marker AND an original transaction id", () => {
      expect(isAppleBilledManagerPurchase("apple", "1000000123")).toBe(true);
      expect(isAppleBilledManagerPurchase("APPLE", " 1000000123 ")).toBe(true);
    });

    it("is false without the transaction anchor (blocks a spoofed bare tier write)", () => {
      expect(isAppleBilledManagerPurchase("apple", null)).toBe(false);
      expect(isAppleBilledManagerPurchase("apple", "")).toBe(false);
      expect(isAppleBilledManagerPurchase("apple", "   ")).toBe(false);
    });

    it("is false for non-apple billing", () => {
      expect(isAppleBilledManagerPurchase("monthly", "1000000123")).toBe(false);
      expect(isAppleBilledManagerPurchase("free", "1000000123")).toBe(false);
      expect(isAppleBilledManagerPurchase(null, "1000000123")).toBe(false);
    });
  });

  describe("appleManagerPurchaseSessionId / isAppleManagedManagerPurchase", () => {
    it("round-trips the synthetic session id prefix", () => {
      const id = appleManagerPurchaseSessionId("1000000123456789");
      expect(id).toBe("apple_iap_1000000123456789");
      expect(isAppleManagedManagerPurchase(id)).toBe(true);
    });

    it("does not treat Stripe / admin / waiver session ids as Apple", () => {
      expect(isAppleManagedManagerPurchase("cs_test_123")).toBe(false);
      expect(isAppleManagedManagerPurchase("admin_MGR-1")).toBe(false);
      expect(isAppleManagedManagerPurchase("axis_waiver_pro_u1")).toBe(false);
      expect(isAppleManagedManagerPurchase(null)).toBe(false);
    });
  });

  describe("tierForAppleProductId", () => {
    it("maps launch product ids to tier + cadence", () => {
      expect(tierForAppleProductId("space.proplane.app.pro.monthly")).toEqual({
        tier: "pro",
        billing: "monthly",
      });
      expect(tierForAppleProductId("space.proplane.app.business.monthly")).toEqual({
        tier: "business",
        billing: "monthly",
      });
    });

    it("returns null for unknown / empty product ids", () => {
      expect(tierForAppleProductId("com.other.app.pro")).toBeNull();
      expect(tierForAppleProductId(null)).toBeNull();
      expect(tierForAppleProductId("")).toBeNull();
    });

    it("launch set is Pro + Business monthly only (annual is a fast-follow)", () => {
      expect([...APPLE_IAP_LAUNCH_PRODUCT_IDS].sort()).toEqual(
        [
          "space.proplane.app.business.monthly",
          "space.proplane.app.pro.monthly",
        ].sort(),
      );
      for (const id of APPLE_IAP_LAUNCH_PRODUCT_IDS) {
        expect(tierForAppleProductId(id)?.billing).toBe("monthly");
      }
    });
  });
});
