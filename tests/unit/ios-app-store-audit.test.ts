import { describe, expect, it } from "vitest";

import {
  auditSubscriptionInventory,
  currentUsdPrice,
  EXPECTED_APPLE_SUBSCRIPTIONS,
} from "../../scripts/ios-app-store-audit.mjs";

function subscription(productId: string, period: string, usd: string) {
  return {
    id: productId,
    attributes: { productId, subscriptionPeriod: period, state: "READY_TO_SUBMIT" },
    localizations: [{ id: "en", attributes: { locale: "en-US" } }],
    usd,
  };
}

describe("App Store release audit", () => {
  it("accepts the exact four-product monthly and annual catalog", () => {
    const subscriptions = Object.entries(EXPECTED_APPLE_SUBSCRIPTIONS).map(
      ([productId, expected]) => subscription(productId, expected.period, expected.usd),
    );
    expect(auditSubscriptionInventory(subscriptions)).toEqual([]);
  });

  it("reports missing annual products, wrong duration, price, localization, and metadata", () => {
    const subscriptions = [
      {
        ...subscription("space.proplane.app.pro.monthly", "ONE_YEAR", "19.99"),
        attributes: {
          productId: "space.proplane.app.pro.monthly",
          subscriptionPeriod: "ONE_YEAR",
          state: "MISSING_METADATA",
        },
        localizations: [],
      },
      subscription("space.proplane.app.business.monthly", "ONE_MONTH", "200.00"),
    ];
    const problems = auditSubscriptionInventory(subscriptions);

    expect(problems.join("\n")).toMatch(/pro\.annual.*does not exist/);
    expect(problems.join("\n")).toMatch(/business\.annual.*does not exist/);
    expect(problems.join("\n")).toMatch(/duration ONE_YEAR/);
    expect(problems.join("\n")).toMatch(/US price 19\.99/);
    expect(problems.join("\n")).toMatch(/no subscription localization/);
    expect(problems.join("\n")).toMatch(/missing required App Store metadata/);
  });

  it("selects the latest active US price and resolves its price point", () => {
    expect(
      currentUsdPrice({
        data: [
          {
            attributes: { startDate: null },
            relationships: { subscriptionPricePoint: { data: { id: "old" } } },
          },
          {
            attributes: { startDate: "2026-01-01" },
            relationships: { subscriptionPricePoint: { data: { id: "current" } } },
          },
          {
            attributes: { startDate: "2999-01-01" },
            relationships: { subscriptionPricePoint: { data: { id: "future" } } },
          },
        ],
        included: [
          { type: "subscriptionPricePoints", id: "old", attributes: { customerPrice: "9.99" } },
          { type: "subscriptionPricePoints", id: "current", attributes: { customerPrice: "192" } },
          { type: "subscriptionPricePoints", id: "future", attributes: { customerPrice: "999" } },
        ],
      }),
    ).toBe("192.00");
  });
});
