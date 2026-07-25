import { describe, expect, it } from "vitest";

import { buildPaymentReceiptGmailQuery } from "@/lib/gmail-payments/gmail-query";
import { normalizeGmailPaymentsConnection } from "@/lib/gmail-payments/settings";

describe("buildPaymentReceiptGmailQuery", () => {
  it("includes venmo and zelle senders with day window", () => {
    const q = buildPaymentReceiptGmailQuery(14);
    expect(q).toContain("newer_than:14d");
    expect(q).toContain("venmo.com");
    expect(q).toContain("zellepay.com");
  });

  it("clamps days between 1 and 90", () => {
    expect(buildPaymentReceiptGmailQuery(0)).toContain("newer_than:1d");
    expect(buildPaymentReceiptGmailQuery(200)).toContain("newer_than:90d");
  });
});

describe("normalizeGmailPaymentsConnection", () => {
  it("requires refresh token when connected", () => {
    expect(
      normalizeGmailPaymentsConnection({ connected: true, refreshToken: "rtok" }).connected,
    ).toBe(true);
    expect(normalizeGmailPaymentsConnection({ connected: true }).connected).toBe(false);
  });
});
