import { describe, expect, it } from "vitest";

import { parsePaymentReceiptEmail } from "@/lib/payment-receipt-email/parse-receipt";
import {
  extractPaymentInboxToken,
  paymentInboxAddress,
} from "@/lib/payment-receipt-email/payment-inbox";

describe("payment inbox addressing", () => {
  it("builds payments+token addresses", () => {
    expect(paymentInboxAddress("abc123token")).toMatch(/^payments\+abc123token@/);
  });

  it("extracts token from plus addressing", () => {
    expect(
      extractPaymentInboxToken(["payments+mytoken12@prop-lane.space", "other@example.com"]),
    ).toBe("mytoken12");
  });

  it("ignores non-payment local parts", () => {
    expect(extractPaymentInboxToken(["support@prop-lane.space"])).toBeNull();
  });
});

describe("parsePaymentReceiptEmail", () => {
  it("parses a Venmo receipt with PL- reference", () => {
    const parsed = parsePaymentReceiptEmail({
      fromEmail: "notify@venmo.com",
      subject: "You paid Alex $150.00",
      body: "Memo: PL-ABC123 for rent",
    });
    expect(parsed).toEqual({
      channel: "venmo",
      amountCents: 15000,
      paymentReference: "PL-ABC123",
    });
  });

  it("parses a Zelle receipt", () => {
    const parsed = parsePaymentReceiptEmail({
      fromEmail: "noreply@zellepay.com",
      subject: "You sent $75.50 with Zelle",
      body: "Message: PL-Z9X8Y7",
    });
    expect(parsed).toEqual({
      channel: "zelle",
      amountCents: 7550,
      paymentReference: "PL-Z9X8Y7",
    });
  });

  it("rejects messages without a PL- code", () => {
    expect(
      parsePaymentReceiptEmail({
        fromEmail: "notify@venmo.com",
        subject: "You paid $50.00",
        body: "Thanks!",
      }),
    ).toBeNull();
  });

  it("rejects untrusted senders without channel hints", () => {
    expect(
      parsePaymentReceiptEmail({
        fromEmail: "spam@evil.com",
        subject: "You paid $50.00",
        body: "PL-ABC123",
      }),
    ).toBeNull();
  });
});
