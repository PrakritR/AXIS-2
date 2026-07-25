import { describe, expect, it } from "vitest";

import { generatePaymentReference } from "@/lib/payment-reference";

describe("generatePaymentReference", () => {
  it("returns a stable PL- code for the same charge id", () => {
    const id = "hc_app_fee_test@example.com_prop1";
    expect(generatePaymentReference(id)).toBe(generatePaymentReference(id));
  });

  it("prefixes codes with PL-", () => {
    expect(generatePaymentReference("hc_rent_abc")).toMatch(/^PL-[A-Z0-9]{6}$/);
  });

  it("returns PL-UNKNOWN for empty ids", () => {
    expect(generatePaymentReference("")).toBe("PL-UNKNOWN");
  });
});
