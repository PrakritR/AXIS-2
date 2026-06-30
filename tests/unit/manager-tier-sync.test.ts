import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceRoleClient: vi.fn(),
}));

import { applyExpiredManagerPurchaseDowngrade, revokeUnauthorizedManagerPaidTier } from "@/lib/manager-tier-sync";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

type Row = Record<string, unknown>;

/**
 * Builds a fake service-role client over `manager_purchases` whose single SELECT
 * resolves to `row` and whose UPDATE is recorded. Both downgrade helpers do exactly
 * one `.from().select().eq().maybeSingle()` followed by an optional
 * `.from().update().eq()` — the spy lets us assert whether a destructive write fired.
 */
function fakeClient(row: Row | null) {
  const updateEq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn(() => ({ eq: updateEq }));
  const selectEq = vi.fn();
  const builder = {
    eq: selectEq,
    maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
  };
  selectEq.mockReturnValue(builder);
  const select = vi.fn(() => builder);
  vi.mocked(createSupabaseServiceRoleClient).mockReturnValue({
    from: vi.fn(() => ({ select, update })),
  } as never);
  return { update, updateEq, selectEq };
}

describe("manager-tier-sync waiver-grant protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("revokeUnauthorizedManagerPaidTier", () => {
    it("never revokes a payment-waiver / coupon grant", async () => {
      const { update } = fakeClient({
        id: "purchase-1",
        tier: "pro",
        billing: "free",
        stripe_subscription_id: null,
        stripe_checkout_session_id: "cs_test_normal",
        promo_code: "FREE100",
      });

      await expect(revokeUnauthorizedManagerPaidTier("user-1")).resolves.toBe(false);
      expect(update).not.toHaveBeenCalled();
    });

    it("revokes a self-assigned paid tier with no Stripe, admin, or waiver backing", async () => {
      const { update, updateEq, selectEq } = fakeClient({
        id: "purchase-1",
        tier: "pro",
        billing: "free",
        stripe_subscription_id: null,
        stripe_checkout_session_id: "cs_test_normal",
        promo_code: null,
      });

      await expect(revokeUnauthorizedManagerPaidTier("user-1")).resolves.toBe(true);
      expect(selectEq).toHaveBeenCalledWith("user_id", "user-1");
      expect(update).toHaveBeenCalledWith({ tier: "free", billing: "free", stripe_subscription_id: null });
      expect(updateEq).toHaveBeenCalledWith("id", "purchase-1");
    });
  });

  describe("applyExpiredManagerPurchaseDowngrade", () => {
    it("never downgrades a payment-waiver / coupon grant, even when expired", async () => {
      const { update } = fakeClient({
        id: "purchase-1",
        tier: "pro",
        billing: "monthly",
        paid_at: "2000-01-01T00:00:00.000Z", // long past — would be expired without the waiver guard
        stripe_subscription_id: null,
        promo_code: "FREE100",
      });

      await expect(applyExpiredManagerPurchaseDowngrade("user-1")).resolves.toBe(false);
      expect(update).not.toHaveBeenCalled();
    });

    it("downgrades an expired non-waiver period grant", async () => {
      const { update, updateEq, selectEq } = fakeClient({
        id: "purchase-1",
        tier: "pro",
        billing: "monthly",
        paid_at: "2000-01-01T00:00:00.000Z",
        stripe_subscription_id: null,
        promo_code: null,
      });

      await expect(applyExpiredManagerPurchaseDowngrade("user-1")).resolves.toBe(true);
      expect(selectEq).toHaveBeenCalledWith("user_id", "user-1");
      expect(update).toHaveBeenCalledWith({ tier: "free", billing: "free" });
      expect(updateEq).toHaveBeenCalledWith("id", "purchase-1");
    });
  });
});
