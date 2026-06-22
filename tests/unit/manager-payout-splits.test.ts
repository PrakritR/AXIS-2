import { describe, expect, it } from "vitest";
import {
  emptyPayoutSplitsConfig,
  normalizePayoutSplitsConfig,
  quotePayoutSplit,
  validatePayoutSplitsConfig,
} from "@/lib/manager-payout-splits";

describe("manager-payout-splits", () => {
  it("normalizes empty config", () => {
    expect(normalizePayoutSplitsConfig(null)).toEqual(emptyPayoutSplitsConfig());
  });

  it("validates 100% totals", () => {
    const valid = emptyPayoutSplitsConfig();
    expect(validatePayoutSplitsConfig(valid)).toEqual({ ok: true });

    const invalid = { ...valid, managerApplicationFeePercent: 50 };
    expect(validatePayoutSplitsConfig(invalid).ok).toBe(false);
  });

  it("quotes payout split with remainder to manager", () => {
    const config = normalizePayoutSplitsConfig({
      managerApplicationFeePercent: 70,
      managerRentPercent: 100,
      owners: [{ displayName: "Owner A", applicationFeePercent: 30, rentPercent: 0 }],
    });
    const quote = quotePayoutSplit({ grossAmountCents: 10000, kind: "application_fee", tier: "pro", config });
    expect(quote.grossAmountCents).toBe(10000);
    expect(quote.manager.amountCents + quote.owners[0]!.amountCents).toBe(quote.distributableCents);
  });
});
