import { describe, expect, it } from "vitest";
import {
  formatManagerMonthlyLabel,
  managerSectionAllowedForTier,
  managerTierPropertyLimitReached,
  maxAccountLinksForTier,
  maxPropertiesForManagerTier,
  normalizeManagerSkuTier,
  pickBestManagerPurchaseRow,
} from "@/lib/manager-access";

describe("manager-access", () => {
  it("normalizes tier strings", () => {
    expect(normalizeManagerSkuTier("free")).toBe("free");
    expect(normalizeManagerSkuTier("PRO")).toBe("pro");
    expect(normalizeManagerSkuTier("")).toBeNull();
    expect(normalizeManagerSkuTier("enterprise")).toBeNull();
  });

  it("enforces property limits per tier", () => {
    expect(maxPropertiesForManagerTier("free")).toBe(1);
    expect(maxPropertiesForManagerTier("pro")).toBe(2);
    expect(maxPropertiesForManagerTier("business")).toBe(20);
    expect(managerTierPropertyLimitReached("free", 1)).toBe(true);
    expect(managerTierPropertyLimitReached("pro", 1)).toBe(false);
  });

  it("limits account links per tier", () => {
    expect(maxAccountLinksForTier("free")).toBe(1);
    expect(maxAccountLinksForTier("pro")).toBe(2);
    expect(maxAccountLinksForTier("business")).toBe(20);
  });

  it("gates free-tier sections", () => {
    expect(managerSectionAllowedForTier("properties", "free")).toBe(true);
    expect(managerSectionAllowedForTier("residents", "free")).toBe(false);
    expect(managerSectionAllowedForTier("leases", "free")).toBe(false);
    expect(managerSectionAllowedForTier("services", "free")).toBe(false);
    expect(managerSectionAllowedForTier("inbox", "free")).toBe(false);
    expect(managerSectionAllowedForTier("inbox", "paid")).toBe(true);
  });

  it("formats monthly labels", () => {
    expect(formatManagerMonthlyLabel("free")).toBe("$0/mo");
    expect(formatManagerMonthlyLabel("pro")).toBe("$20/mo");
  });

  it("detects stripe-managed billing intervals", async () => {
    const { isStripeManagedBilling } = await import("@/lib/manager-access");
    expect(isStripeManagedBilling("monthly")).toBe(true);
    expect(isStripeManagedBilling("annual")).toBe(true);
    expect(isStripeManagedBilling("admin")).toBe(false);
    expect(isStripeManagedBilling("portal")).toBe(false);
    expect(isStripeManagedBilling("free")).toBe(false);
  });

  it("prefers linked signup tier over stale higher-tier checkout rows", () => {
    const userId = "user-1";
    const rows = [
      {
        id: "old-pro",
        tier: "pro",
        billing: "monthly",
        stripe_customer_id: null,
        stripe_subscription_id: null,
        paid_at: "2026-06-01T00:00:00.000Z",
        user_id: null,
      },
      {
        id: "new-free",
        tier: "free",
        billing: "free",
        stripe_customer_id: null,
        stripe_subscription_id: null,
        paid_at: "2026-06-27T00:00:00.000Z",
        user_id: userId,
      },
    ];
    const picked = pickBestManagerPurchaseRow(rows, userId);
    expect(picked?.id).toBe("new-free");
    expect(picked?.tier).toBe("free");
  });
});
