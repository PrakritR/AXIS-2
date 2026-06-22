import { describe, expect, it } from "vitest";
import { isApplicationFeeCheckoutSession } from "@/lib/stripe-application-fee";

describe("stripe-application-fee", () => {
  it("identifies application fee sessions", () => {
    expect(
      isApplicationFeeCheckoutSession({ metadata: { purpose: "rental_application_fee" } } as never),
    ).toBe(true);
    expect(isApplicationFeeCheckoutSession({ metadata: {} } as never)).toBe(false);
  });
});
