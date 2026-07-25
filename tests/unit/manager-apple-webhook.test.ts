import { describe, expect, it } from "vitest";
import {
  interpretRevenueCatWebhookEvent,
  isRevenueCatRefundCancellation,
  revenueCatSubscriberActiveTier,
  type RevenueCatWebhookEvent,
} from "@/lib/manager-apple-webhook";

const NOW = Date.UTC(2026, 6, 24); // 2026-07-24
const FUTURE = NOW + 30 * 24 * 60 * 60 * 1000;
const PAST = NOW - 24 * 60 * 60 * 1000;
const PRO = "com.axisseattlehousing.app.pro.monthly";
const BUSINESS = "com.axisseattlehousing.app.business.monthly";

function ev(overrides: Partial<RevenueCatWebhookEvent>): RevenueCatWebhookEvent {
  return {
    type: "INITIAL_PURCHASE",
    app_user_id: "user-1",
    product_id: PRO,
    environment: "PRODUCTION",
    expiration_at_ms: FUTURE,
    original_transaction_id: "1000000123",
    ...overrides,
  };
}

describe("interpretRevenueCatWebhookEvent", () => {
  it("grants on an initial purchase with a future expiry", () => {
    expect(interpretRevenueCatWebhookEvent(ev({}), NOW)).toEqual({
      action: "grant",
      appUserId: "user-1",
      tier: "pro",
      billing: "monthly",
      originalTransactionId: "1000000123",
      environment: "PRODUCTION",
    });
  });

  it("grants Business from the business product id", () => {
    const d = interpretRevenueCatWebhookEvent(ev({ product_id: BUSINESS }), NOW);
    expect(d).toMatchObject({ action: "grant", tier: "business" });
  });

  it("keeps access on a RENEWAL", () => {
    expect(interpretRevenueCatWebhookEvent(ev({ type: "RENEWAL" }), NOW)).toMatchObject({ action: "grant" });
  });

  it("keeps access on a cancellation (auto-renew off) until the period ends", () => {
    // expiry still in the future → still paid
    const d = interpretRevenueCatWebhookEvent(ev({ type: "CANCELLATION", cancel_reason: "UNSUBSCRIBE" }), NOW);
    expect(d).toMatchObject({ action: "grant" });
  });

  it("keeps access during a billing issue while grace has not elapsed", () => {
    const d = interpretRevenueCatWebhookEvent(
      ev({ type: "BILLING_ISSUE", expiration_at_ms: PAST, grace_period_expiration_at_ms: FUTURE }),
      NOW,
    );
    expect(d).toMatchObject({ action: "grant" });
  });

  it("revokes on EXPIRATION", () => {
    const d = interpretRevenueCatWebhookEvent(ev({ type: "EXPIRATION", expiration_at_ms: PAST }), NOW);
    expect(d).toEqual({ action: "revoke", appUserId: "user-1", originalTransactionId: "1000000123" });
  });

  it("revokes immediately on a refund cancellation", () => {
    const d = interpretRevenueCatWebhookEvent(
      ev({ type: "CANCELLATION", cancel_reason: "CUSTOMER_SUPPORT", expiration_at_ms: FUTURE }),
      NOW,
    );
    expect(d).toMatchObject({ action: "revoke" });
  });

  it("revokes when coverage has lapsed even on a non-expiration type", () => {
    const d = interpretRevenueCatWebhookEvent(ev({ type: "SUBSCRIPTION_PAUSED", expiration_at_ms: PAST }), NOW);
    expect(d).toMatchObject({ action: "revoke" });
  });

  it("ignores events for products that are not our subscription", () => {
    expect(interpretRevenueCatWebhookEvent(ev({ product_id: "com.other.thing" }), NOW).action).toBe("ignore");
  });

  it("ignores TEST / TRANSFER / INVOICE_ISSUANCE and missing app_user_id", () => {
    expect(interpretRevenueCatWebhookEvent(ev({ type: "TEST" }), NOW).action).toBe("ignore");
    expect(interpretRevenueCatWebhookEvent(ev({ type: "TRANSFER" }), NOW).action).toBe("ignore");
    expect(interpretRevenueCatWebhookEvent(ev({ type: "INVOICE_ISSUANCE" }), NOW).action).toBe("ignore");
    expect(interpretRevenueCatWebhookEvent(ev({ app_user_id: "", original_app_user_id: "" }), NOW).action).toBe(
      "ignore",
    );
  });

  it("falls back to original_app_user_id when app_user_id is absent", () => {
    const d = interpretRevenueCatWebhookEvent(ev({ app_user_id: null, original_app_user_id: "user-9" }), NOW);
    expect(d).toMatchObject({ action: "grant", appUserId: "user-9" });
  });
});

describe("isRevenueCatRefundCancellation", () => {
  it("flags CUSTOMER_SUPPORT cancellations and REFUND events", () => {
    expect(isRevenueCatRefundCancellation({ type: "CANCELLATION", cancel_reason: "CUSTOMER_SUPPORT" })).toBe(true);
    expect(isRevenueCatRefundCancellation({ type: "REFUND" })).toBe(true);
  });
  it("does not flag an auto-renew-off cancellation", () => {
    expect(isRevenueCatRefundCancellation({ type: "CANCELLATION", cancel_reason: "UNSUBSCRIBE" })).toBe(false);
  });
});

describe("revenueCatSubscriberActiveTier", () => {
  it("returns the active managed tier", () => {
    const sub = { subscriptions: { [PRO]: { expires_date: new Date(FUTURE).toISOString() } } };
    expect(revenueCatSubscriberActiveTier(sub, NOW)).toMatchObject({ tier: "pro", billing: "monthly" });
  });

  it("counts a subscription active while in grace even if expires_date passed", () => {
    const sub = {
      subscriptions: {
        [BUSINESS]: {
          expires_date: new Date(PAST).toISOString(),
          grace_period_expires_date: new Date(FUTURE).toISOString(),
        },
      },
    };
    expect(revenueCatSubscriberActiveTier(sub, NOW)).toMatchObject({ tier: "business" });
  });

  it("returns null when every managed subscription has lapsed", () => {
    const sub = { subscriptions: { [PRO]: { expires_date: new Date(PAST).toISOString() } } };
    expect(revenueCatSubscriberActiveTier(sub, NOW)).toBeNull();
  });

  it("ignores non-managed products and empty subscribers", () => {
    expect(
      revenueCatSubscriberActiveTier({ subscriptions: { "com.other": { expires_date: new Date(FUTURE).toISOString() } } }, NOW),
    ).toBeNull();
    expect(revenueCatSubscriberActiveTier(null, NOW)).toBeNull();
    expect(revenueCatSubscriberActiveTier({ subscriptions: {} }, NOW)).toBeNull();
  });

  it("picks the furthest-future expiry when several are active", () => {
    const sub = {
      subscriptions: {
        [PRO]: { expires_date: new Date(FUTURE).toISOString() },
        [BUSINESS]: { expires_date: new Date(FUTURE + 10 * 86400000).toISOString() },
      },
    };
    expect(revenueCatSubscriberActiveTier(sub, NOW)).toMatchObject({ tier: "business" });
  });
});
