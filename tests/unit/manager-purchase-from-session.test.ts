import { describe, expect, it } from "vitest";
import { checkoutSessionIndicatesPaidPurchase } from "@/lib/manager-purchase-from-session";
import { mockCheckoutSession } from "../mocks/stripe/events";

describe("manager-purchase-from-session", () => {
  it("detects paid checkout sessions", () => {
    expect(checkoutSessionIndicatesPaidPurchase(mockCheckoutSession())).toBe(true);
    expect(checkoutSessionIndicatesPaidPurchase(mockCheckoutSession({ payment_status: "unpaid", status: "open" }))).toBe(
      false,
    );
  });

  it("accepts completed subscription with unpaid payment status", () => {
    expect(
      checkoutSessionIndicatesPaidPurchase(
        mockCheckoutSession({ payment_status: "unpaid", status: "complete", mode: "subscription" }),
      ),
    ).toBe(true);
  });
});
