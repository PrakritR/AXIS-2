// @vitest-environment jsdom
/**
 * Regression: screening-paywall-side-effect.
 *
 * `GET /api/manager/subscription` answers with TWO plan values and they mean
 * different things:
 *
 *   - `tier` — the raw committed SKU, `null` for an account with no
 *     `manager_purchases` row.
 *   - `effectiveTier` — the plan the product HOLDS the account to, where that
 *     same rowless account resolves to "free".
 *
 * The property cap needs the second. Everything else that mirrors a server gate
 * still reading `null` as legacy full access needs the first: the Screenings
 * panel calls `isManagerFreePlan` on this cache, and
 * `orderScreeningForApplication` happily serves a rowless account — so caching
 * `effectiveTier` for every caller replaced a working screen with the
 * "requires Pro or Business" paywall. The interface must never lock a surface
 * the API is serving.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadManagerEffectivePlanTierClient,
  loadManagerSubscriptionTierClient,
  readManagerEffectivePlanTierClient,
  readManagerSubscriptionTierClient,
  resetManagerSubscriptionTierClientCache,
} from "@/lib/manager-subscription-client";

let body: Record<string, unknown> = {};
let ok = true;
let fetchCalls = 0;

beforeEach(() => {
  resetManagerSubscriptionTierClientCache();
  body = {};
  ok = true;
  fetchCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      fetchCalls += 1;
      return { ok, status: ok ? 200 : 500, json: async () => body } as unknown as Response;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetManagerSubscriptionTierClientCache();
});

describe("the two plan values are kept apart", () => {
  it("gives the raw tier to the entitlement readers that expect legacy full access", async () => {
    body = { tier: null, effectiveTier: "free" };

    // Screenings reads this one: `null` here is what keeps the panel visible
    // for an account whose screening the server still permits.
    await expect(loadManagerSubscriptionTierClient()).resolves.toBeNull();
  });

  it("gives the effective plan to the property-limit pre-check", async () => {
    body = { tier: null, effectiveTier: "free" };

    await expect(loadManagerEffectivePlanTierClient()).resolves.toBe("free");
  });

  it("passes a committed SKU through both", async () => {
    body = { tier: "business", effectiveTier: "business" };

    await expect(loadManagerSubscriptionTierClient()).resolves.toBe("business");
    await expect(loadManagerEffectivePlanTierClient()).resolves.toBe("business");
  });

  it("falls back to the raw tier when the route sends no effectiveTier", async () => {
    // An older deployment: keep the pre-cap behaviour rather than inventing a
    // Free plan the server is not enforcing.
    body = { tier: "pro" };

    await expect(loadManagerEffectivePlanTierClient()).resolves.toBe("pro");
  });
});

describe("caching", () => {
  it("fills both values from ONE request and serves them from cache", async () => {
    body = { tier: null, effectiveTier: "free" };

    const [raw, effective] = await Promise.all([
      loadManagerSubscriptionTierClient(),
      loadManagerEffectivePlanTierClient(),
    ]);

    expect(fetchCalls).toBe(1);
    expect(raw).toBeNull();
    expect(effective).toBe("free");
    expect(readManagerSubscriptionTierClient()).toBeNull();
    expect(readManagerEffectivePlanTierClient()).toBe("free");

    await loadManagerSubscriptionTierClient();
    await loadManagerEffectivePlanTierClient();
    expect(fetchCalls).toBe(1);
  });

  it("resolves both to null on a failed response without caching a plan", async () => {
    ok = false;

    await expect(loadManagerSubscriptionTierClient()).resolves.toBeNull();
    await expect(loadManagerEffectivePlanTierClient()).resolves.toBeNull();
  });

  it("clears both values on reset", async () => {
    body = { tier: "pro", effectiveTier: "pro" };
    await loadManagerEffectivePlanTierClient();

    resetManagerSubscriptionTierClientCache();

    expect(readManagerSubscriptionTierClient()).toBeUndefined();
    expect(readManagerEffectivePlanTierClient()).toBeUndefined();
  });

  /**
   * Regression: subscription-route-still-collapses-unreadable-plan-to-free.
   * A plan the server could not read must not stick for the whole session —
   * that is how one transient database error turned into a Business manager
   * staring at "reached your plan limit of 1 property" until they reloaded.
   */
  it("does not cache a plan the server could not read", async () => {
    body = { tier: null, effectiveTier: null, planUnknown: true };

    await expect(loadManagerEffectivePlanTierClient()).resolves.toBeNull();
    await expect(loadManagerSubscriptionTierClient()).resolves.toBeNull();
    expect(readManagerEffectivePlanTierClient()).toBeUndefined();
    expect(readManagerSubscriptionTierClient()).toBeUndefined();

    // The next read retries and picks up the real plan.
    body = { tier: "business", effectiveTier: "business" };
    await expect(loadManagerEffectivePlanTierClient()).resolves.toBe("business");
  });
});
