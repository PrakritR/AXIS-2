import { describe, expect, it } from "vitest";

import { DEFAULT_HOLDING_DEPOSIT_LABEL, normalizeHoldingDepositLabel } from "@/lib/household-charges";

describe("holding deposit", () => {
  it("defaults blank values to $100", () => {
    expect(normalizeHoldingDepositLabel(undefined)).toBe(DEFAULT_HOLDING_DEPOSIT_LABEL);
    expect(normalizeHoldingDepositLabel("")).toBe("$100");
  });

  it("preserves explicit manager amounts", () => {
    expect(normalizeHoldingDepositLabel("$250")).toBe("$250");
    expect(normalizeHoldingDepositLabel("75")).toBe("75");
  });
});
