import { describe, expect, it } from "vitest";

import {
  ANNUAL_PRODUCT_SPECS,
  buildAnnualSubscriptionCreate,
  buildLocalizationCreate,
  selectPricePoint,
} from "../../scripts/ios-app-store-provision-annual.mjs";

const source = {
  id: "monthly",
  attributes: {
    productId: "space.proplane.app.pro.monthly",
    subscriptionPeriod: "ONE_MONTH",
    groupLevel: 2,
    familySharable: false,
    reviewNote: "Sign in and open Plans.",
  },
};

describe("annual App Store subscription provisioning", () => {
  it("creates the annual product in the source tier with the immutable intended id", () => {
    const body = buildAnnualSubscriptionCreate(ANNUAL_PRODUCT_SPECS[0], source, "group");
    expect(body.data.attributes).toEqual({
      name: "PropLane Pro Annual",
      productId: "space.proplane.app.pro.annual",
      subscriptionPeriod: "ONE_YEAR",
      groupLevel: 2,
      familySharable: false,
      reviewNote: "Sign in and open Plans.",
    });
    expect(body.data.relationships.group.data).toEqual({ type: "subscriptionGroups", id: "group" });
  });

  it("creates concise annual customer-facing metadata", () => {
    const body = buildLocalizationCreate(ANNUAL_PRODUCT_SPECS[1], "annual");
    expect(body.data.attributes).toEqual({
      locale: "en-US",
      name: "PropLane Business Annual",
      description: "Business plan access, billed once per year.",
    });
    expect(body.data.relationships.subscription.data.id).toBe("annual");
  });

  it("selects exactly the requested Apple price point and refuses ambiguity", () => {
    const points = [
      { id: "monthly", attributes: { customerPrice: "20" } },
      { id: "annual", attributes: { customerPrice: "192.0" } },
    ];
    expect(selectPricePoint(points, "192.00").id).toBe("annual");
    expect(() => selectPricePoint(points, "193.00")).toThrow(/found 0/);
    expect(() => selectPricePoint([points[1], points[1]], "192.00")).toThrow(/found 2/);
  });

  it("refuses to clone a non-monthly or unranked source", () => {
    expect(() =>
      buildAnnualSubscriptionCreate(
        ANNUAL_PRODUCT_SPECS[0],
        { ...source, attributes: { ...source.attributes, subscriptionPeriod: "ONE_YEAR" } },
        "group",
      ),
    ).toThrow(/not a one-month/);
    expect(() =>
      buildAnnualSubscriptionCreate(
        ANNUAL_PRODUCT_SPECS[0],
        { ...source, attributes: { ...source.attributes, groupLevel: undefined } },
        "group",
      ),
    ).toThrow(/no valid group level/);
  });
});
