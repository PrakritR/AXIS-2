import { describe, expect, it } from "vitest";
import { apAgingBucket, managerBillBadgeTone } from "@/lib/manager-bills";
import { applyPartialPaymentCents } from "@/lib/nsf-fees";
import { DEFAULT_MANAGER_BILLING_SETTINGS } from "@/lib/manager-billing-settings";

describe("managerBillBadgeTone", () => {
  it("maps bill statuses to shared badge tones", () => {
    expect(managerBillBadgeTone("draft")).toBe("pending");
    expect(managerBillBadgeTone("paid")).toBe("confirmed");
    expect(managerBillBadgeTone("void")).toBe("overdue");
  });
});

describe("apAgingBucket", () => {
  it("buckets past-due days", () => {
    expect(apAgingBucket(0)).toBe("Current");
    expect(apAgingBucket(45)).toBe("31–60 days");
    expect(apAgingBucket(120)).toBe("90+ days");
  });
});

describe("applyPartialPaymentCents", () => {
  it("marks partially paid when payment is short", () => {
    const result = applyPartialPaymentCents(100_00, 40_00);
    expect(result.status).toBe("partially_paid");
    expect(result.paidAmountCents).toBe(40_00);
    expect(result.balanceCents).toBe(60_00);
  });

  it("marks paid when fully covered", () => {
    const result = applyPartialPaymentCents(100_00, 100_00);
    expect(result.status).toBe("paid");
  });
});

describe("DEFAULT_MANAGER_BILLING_SETTINGS", () => {
  it("enables NSF fee by default", () => {
    expect(DEFAULT_MANAGER_BILLING_SETTINGS.nsfFeeEnabled).toBe(true);
    expect(DEFAULT_MANAGER_BILLING_SETTINGS.nsfFeeAmountCents).toBeGreaterThan(0);
  });
});
