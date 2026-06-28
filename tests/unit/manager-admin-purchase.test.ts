import { describe, expect, it } from "vitest";
import {
  applyAdminManagerPurchaseTier,
  isAdminManagedManagerPurchase,
  normalizeAdminManagerBilling,
} from "@/lib/manager-admin-purchase";

describe("manager-admin-purchase", () => {
  it("detects admin-managed purchase rows", () => {
    expect(isAdminManagedManagerPurchase("admin_AXIS-123")).toBe(true);
    expect(isAdminManagedManagerPurchase("cs_test_123")).toBe(false);
  });

  it("normalizes billing for admin grants", () => {
    expect(normalizeAdminManagerBilling("free", "monthly")).toBe("free");
    expect(normalizeAdminManagerBilling("pro", "free")).toBe("portal");
    expect(normalizeAdminManagerBilling("business", "portal")).toBe("portal");
    expect(normalizeAdminManagerBilling("business", "annual")).toBe("annual");
  });

  it("writes admin tier without Stripe subscription id", async () => {
    const updates: Record<string, unknown>[] = [];
    const inserts: Record<string, unknown>[] = [];
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { id: "purchase-1" } }),
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: async () => {
            updates.push(patch);
            return { error: null };
          },
        }),
        insert: async (patch: Record<string, unknown>) => {
          inserts.push(patch);
          return { error: null };
        },
      }),
    };

    const result = await applyAdminManagerPurchaseTier(supabase as never, {
      userId: "user-1",
      email: "mgr@example.com",
      managerId: "AXIS-123",
      tier: "business",
      billing: "portal",
    });

    expect(result.ok).toBe(true);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      tier: "business",
      billing: "portal",
      stripe_subscription_id: null,
      stripe_checkout_session_id: "admin_AXIS-123",
      user_id: "user-1",
    });
    expect(inserts).toHaveLength(0);
  });
});
