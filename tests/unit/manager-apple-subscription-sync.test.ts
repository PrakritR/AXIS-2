import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceRoleClient: vi.fn(),
}));
vi.mock("@/lib/manager-id", () => ({
  generateManagerId: vi.fn(() => "MGR-GEN"),
}));

import {
  applyRevenueCatWebhookEvent,
  downgradeAppleManagerPurchase,
  reconcileManagerPurchaseWithApple,
  upsertAppleManagerPurchase,
} from "@/lib/manager-apple-subscription-sync";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

type Row = Record<string, unknown> & { id: string };

/**
 * Configurable service-role fake over `profiles` + `manager_purchases`. `.eq()`
 * is both awaitable (loadRows) and exposes `.maybeSingle()` (profile / reconcile
 * single-row reads). Records every update/insert for assertions.
 */
function fakeClient(opts: {
  profile?: { email: string | null; manager_id?: string | null } | null;
  rowsByUser?: Row[];
  rowsByEmail?: Row[];
  singleRow?: Row | null;
  insertError?: { code?: string; message?: string } | null;
}) {
  const updates: Array<{ patch: Record<string, unknown>; column: string; value: unknown }> = [];
  const inserts: Array<Record<string, unknown>> = [];

  const profileResult = { data: opts.profile ?? null, error: null };

  function purchaseSelect() {
    return {
      eq: (_col: string, _val: unknown) => {
        const thenable = {
          maybeSingle: async () => ({ data: opts.singleRow ?? null, error: null }),
          then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
            resolve({ data: opts.rowsByUser ?? [], error: null }),
        };
        return thenable;
      },
      ilike: async (_col: string, _val: unknown) => ({ data: opts.rowsByEmail ?? [], error: null }),
    };
  }

  const client = {
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => profileResult }) }),
          update: (patch: Record<string, unknown>) => ({
            eq: async (column: string, value: unknown) => {
              updates.push({ patch, column, value });
              return { error: null };
            },
          }),
        };
      }
      // manager_purchases
      return {
        select: purchaseSelect,
        update: (patch: Record<string, unknown>) => ({
          eq: async (column: string, value: unknown) => {
            updates.push({ patch, column, value });
            return { error: null };
          },
          ilike: async (column: string, value: unknown) => {
            updates.push({ patch, column, value });
            return { error: null };
          },
        }),
        insert: async (patch: Record<string, unknown>) => {
          inserts.push(patch);
          return { error: opts.insertError ?? null };
        },
      };
    }),
  };

  vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(client as never);
  return { updates, inserts };
}

const OTX = "1000000123456789";

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  delete process.env.REVENUECAT_SECRET_API_KEY;
  vi.restoreAllMocks();
});

describe("upsertAppleManagerPurchase", () => {
  it("writes an apple grant onto an existing (non-Stripe) row", async () => {
    const { updates } = fakeClient({
      profile: { email: "m@x.com", manager_id: "MGR-1" },
      rowsByUser: [{ id: "p1", tier: "free", billing: "free", stripe_subscription_id: null, apple_original_transaction_id: null, user_id: "u1" }],
    });

    await expect(
      upsertAppleManagerPurchase({ userId: "u1", tier: "pro", originalTransactionId: OTX, environment: "Production" }),
    ).resolves.toEqual({ ok: true });

    const write = updates.find((u) => u.value === "p1");
    expect(write?.patch).toMatchObject({
      tier: "pro",
      billing: "apple",
      apple_original_transaction_id: OTX,
      apple_environment: "Production",
      stripe_subscription_id: null,
    });
  });

  it("dual-subscribe: keeps the live Stripe tier and only records the apple ids", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { updates } = fakeClient({
      profile: { email: "m@x.com", manager_id: "MGR-1" },
      rowsByUser: [{ id: "p1", tier: "business", billing: "monthly", stripe_subscription_id: "sub_live", apple_original_transaction_id: null, user_id: "u1" }],
    });

    await upsertAppleManagerPurchase({ userId: "u1", tier: "pro", originalTransactionId: OTX, environment: "Production" });

    const write = updates.find((u) => u.value === "p1");
    // Must NOT clear the Stripe subscription or change tier/billing.
    expect(write?.patch).toEqual({
      apple_original_transaction_id: OTX,
      apple_environment: "Production",
      rc_app_user_id: "u1",
      user_id: "u1",
    });
    expect(warn).toHaveBeenCalled();
  });

  it("inserts a new row when none exists", async () => {
    const { inserts } = fakeClient({
      profile: { email: "m@x.com", manager_id: "MGR-1" },
      rowsByUser: [],
      rowsByEmail: [],
    });

    await upsertAppleManagerPurchase({ userId: "u1", tier: "business", originalTransactionId: OTX, environment: "Sandbox" });

    expect(inserts[0]).toMatchObject({
      stripe_checkout_session_id: `apple_iap_${OTX}`,
      tier: "business",
      billing: "apple",
      apple_original_transaction_id: OTX,
      manager_id: "MGR-1",
      user_id: "u1",
    });
  });

  it("rejects without a profile email", async () => {
    fakeClient({ profile: { email: null } });
    await expect(
      upsertAppleManagerPurchase({ userId: "u1", tier: "pro", originalTransactionId: OTX, environment: null }),
    ).resolves.toEqual({ ok: false, error: "Account email not found." });
  });
});

describe("downgradeAppleManagerPurchase", () => {
  it("downgrades an apple-governed row to free", async () => {
    const { updates } = fakeClient({
      profile: { email: "m@x.com", manager_id: "MGR-1" },
      rowsByUser: [{ id: "p1", tier: "pro", billing: "apple", stripe_subscription_id: null, apple_original_transaction_id: OTX, user_id: "u1" }],
    });

    await downgradeAppleManagerPurchase("u1", OTX);

    const write = updates.find((u) => u.value === "p1");
    expect(write?.patch).toEqual({
      tier: "free",
      billing: "free",
      apple_original_transaction_id: null,
      apple_environment: null,
    });
  });

  it("dual-subscribe: keeps the Stripe tier, only clears the apple ids", async () => {
    const { updates } = fakeClient({
      profile: { email: "m@x.com", manager_id: "MGR-1" },
      rowsByUser: [{ id: "p1", tier: "pro", billing: "monthly", stripe_subscription_id: "sub_live", apple_original_transaction_id: OTX, user_id: "u1" }],
    });

    await downgradeAppleManagerPurchase("u1", OTX);

    const write = updates.find((u) => u.value === "p1");
    expect(write?.patch).toEqual({ apple_original_transaction_id: null, apple_environment: null });
  });

  it("ignores a stale expiration for a superseded transaction id", async () => {
    const { updates } = fakeClient({
      profile: { email: "m@x.com", manager_id: "MGR-1" },
      rowsByUser: [{ id: "p1", tier: "pro", billing: "apple", stripe_subscription_id: null, apple_original_transaction_id: "NEW-TXN", user_id: "u1" }],
    });

    await downgradeAppleManagerPurchase("u1", "OLD-TXN");
    expect(updates.find((u) => u.value === "p1")).toBeUndefined();
  });
});

describe("applyRevenueCatWebhookEvent", () => {
  it("routes a grant event through the upsert path", async () => {
    const { updates } = fakeClient({
      profile: { email: "m@x.com", manager_id: "MGR-1" },
      rowsByUser: [{ id: "p1", tier: "free", billing: "free", stripe_subscription_id: null, apple_original_transaction_id: null, user_id: "u1" }],
    });

    const { decision } = await applyRevenueCatWebhookEvent(
      {
        type: "INITIAL_PURCHASE",
        app_user_id: "u1",
        product_id: "com.axisseattlehousing.app.pro.monthly",
        environment: "PRODUCTION",
        expiration_at_ms: Date.now() + 86400000,
        original_transaction_id: OTX,
      },
      Date.now(),
    );

    expect(decision.action).toBe("grant");
    expect(updates.find((u) => u.value === "p1")?.patch).toMatchObject({ tier: "pro", billing: "apple" });
  });

  it("routes an expiration event through the downgrade path", async () => {
    const { updates } = fakeClient({
      profile: { email: "m@x.com", manager_id: "MGR-1" },
      rowsByUser: [{ id: "p1", tier: "pro", billing: "apple", stripe_subscription_id: null, apple_original_transaction_id: OTX, user_id: "u1" }],
    });

    const { decision } = await applyRevenueCatWebhookEvent(
      {
        type: "EXPIRATION",
        app_user_id: "u1",
        product_id: "com.axisseattlehousing.app.pro.monthly",
        expiration_at_ms: Date.now() - 86400000,
        original_transaction_id: OTX,
      },
      Date.now(),
    );

    expect(decision.action).toBe("revoke");
    expect(updates.find((u) => u.value === "p1")?.patch).toMatchObject({ tier: "free", billing: "free" });
  });
});

describe("reconcileManagerPurchaseWithApple", () => {
  it("is a no-op without the RevenueCat secret key", async () => {
    const { updates } = fakeClient({ singleRow: { id: "p1", tier: "pro", billing: "apple", stripe_subscription_id: null, apple_original_transaction_id: OTX } });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await reconcileManagerPurchaseWithApple("u1");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it("downgrades when RevenueCat definitively reports no active subscription", async () => {
    process.env.REVENUECAT_SECRET_API_KEY = "sk_test";
    const { updates } = fakeClient({
      profile: { email: "m@x.com", manager_id: "MGR-1" },
      singleRow: { id: "p1", tier: "pro", billing: "apple", stripe_subscription_id: null, apple_original_transaction_id: OTX },
      rowsByUser: [{ id: "p1", tier: "pro", billing: "apple", stripe_subscription_id: null, apple_original_transaction_id: OTX, user_id: "u1" }],
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ subscriber: { subscriptions: { "com.axisseattlehousing.app.pro.monthly": { expires_date: "2000-01-01T00:00:00Z" } } } }),
    } as never);

    await reconcileManagerPurchaseWithApple("u1", Date.UTC(2026, 6, 24));
    expect(updates.find((u) => u.value === "p1")?.patch).toMatchObject({ tier: "free", billing: "free" });
  });

  it("keeps state on a transient (non-200) RevenueCat response", async () => {
    process.env.REVENUECAT_SECRET_API_KEY = "sk_test";
    const { updates } = fakeClient({
      singleRow: { id: "p1", tier: "pro", billing: "apple", stripe_subscription_id: null, apple_original_transaction_id: OTX },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as never);

    await reconcileManagerPurchaseWithApple("u1");
    expect(updates).toHaveLength(0);
  });

  it("does not reconcile a Stripe-governed row", async () => {
    process.env.REVENUECAT_SECRET_API_KEY = "sk_test";
    fakeClient({ singleRow: { id: "p1", tier: "pro", billing: "monthly", stripe_subscription_id: "sub_live", apple_original_transaction_id: OTX } });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await reconcileManagerPurchaseWithApple("u1");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
