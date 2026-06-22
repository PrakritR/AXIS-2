import { describe, expect, it } from "vitest";
import {
  formatRentDueDayLabel,
  lateFeePolicyFromSubmission,
  normalizeRentDueDayMode,
  resolveRentDueDayForMonth,
} from "@/lib/payment-policy";

describe("payment-policy", () => {
  it("normalizes rent due day mode", () => {
    expect(normalizeRentDueDayMode("last_of_month")).toBe("last_of_month");
    expect(normalizeRentDueDayMode("other")).toBe("first_of_month");
  });

  it("resolves due day for month", () => {
    expect(resolveRentDueDayForMonth("first_of_month", "2026-02")).toBe(1);
    expect(resolveRentDueDayForMonth("last_of_month", "2026-02")).toBe(28);
  });

  it("formats rent due labels", () => {
    expect(formatRentDueDayLabel("first_of_month")).toBe("1st of month");
    expect(formatRentDueDayLabel("last_of_month")).toBe("Last day of month");
  });

  it("derives late fee policy from submission", () => {
    const policy = lateFeePolicyFromSubmission({ lateFeeEnabled: true, lateFeeGraceDays: 3, lateFeeAmount: "$75" });
    expect(policy.graceDays).toBe(3);
    expect(policy.amount).toBe(75);
  });
});
