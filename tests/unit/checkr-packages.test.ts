import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ENV_KEYS = [
  "CHECKR_STARTER_PRICE_CENTS",
  "CHECKR_ESSENTIAL_PRICE_CENTS",
  "CHECKR_COMPLETE_PRICE_CENTS",
  "CHECKR_IDENTITY_ADDON_PRICE_CENTS",
] as const;

function clearEnv() {
  for (const k of ENV_KEYS) delete process.env[k];
}

describe("checkr package catalog", () => {
  beforeEach(() => {
    clearEnv();
  });
  afterEach(() => {
    clearEnv();
  });

  it("computes order totals from package + add-ons", async () => {
    const { checkrOrderCostCents, formatCheckrPrice } = await import("@/lib/checkr/packages");
    expect(checkrOrderCostCents("starter")).toBe(2999);
    expect(checkrOrderCostCents("essential")).toBe(3999);
    expect(checkrOrderCostCents("complete", ["identity_verification"])).toBe(5294);
    expect(formatCheckrPrice(5294)).toBe("$52.94");
  });

  it("honors env price overrides", async () => {
    process.env.CHECKR_STARTER_PRICE_CENTS = "1999";
    process.env.CHECKR_IDENTITY_ADDON_PRICE_CENTS = "495";
    const { checkrOrderCostCents, checkrPackageCatalog } = await import("@/lib/checkr/packages");
    expect(checkrPackageCatalog()[0]?.priceCents).toBe(1999);
    expect(checkrOrderCostCents("starter", ["identity_verification"])).toBe(2994);
  });
});
