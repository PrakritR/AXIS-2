import { describe, expect, it } from "vitest";
import { axisAchCheckoutPaid, axisAchCheckoutProcessing } from "@/lib/stripe-axis-ach-checkout";
import { mockCheckoutSession } from "../mocks/stripe/events";

describe("stripe-axis-ach-checkout", () => {
  it("detects paid ACH checkout", () => {
    expect(axisAchCheckoutPaid(mockCheckoutSession({ payment_status: "paid" }))).toBe(true);
    expect(axisAchCheckoutPaid(mockCheckoutSession({ payment_status: "no_payment_required" }))).toBe(true);
    expect(axisAchCheckoutPaid(mockCheckoutSession({ payment_status: "unpaid" }))).toBe(false);
  });

  it("detects processing ACH checkout", () => {
    expect(
      axisAchCheckoutProcessing(mockCheckoutSession({ status: "complete", payment_status: "unpaid" })),
    ).toBe(true);
    expect(axisAchCheckoutProcessing(mockCheckoutSession({ status: "open", payment_status: "unpaid" }))).toBe(false);
  });
});
