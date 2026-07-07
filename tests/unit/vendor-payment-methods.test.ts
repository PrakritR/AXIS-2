import { describe, expect, it } from "vitest";
import {
  acceptedPaymentMethodsForVendor,
  buildVendorAcceptedPaymentMethods,
  vendorPaymentMethodSummaryLabel,
  vendorPaymentMethodSummaryLines,
} from "@/lib/vendor-payment-methods";

describe("vendor payment methods", () => {
  it("derives accepted methods from toggles and contacts", () => {
    expect(
      acceptedPaymentMethodsForVendor({
        zellePaymentsEnabled: true,
        zelleContact: "pay@example.com",
        venmoPaymentsEnabled: true,
        venmoContact: "@vendor",
        achPaymentsEnabled: true,
      }),
    ).toEqual(["zelle", "venmo", "ach"]);
  });

  it("prefers explicit acceptedPaymentMethods when set", () => {
    expect(
      acceptedPaymentMethodsForVendor({
        acceptedPaymentMethods: ["venmo"],
        zellePaymentsEnabled: true,
        zelleContact: "pay@example.com",
      }),
    ).toEqual(["venmo"]);
  });

  it("builds summary lines for reminders", () => {
    expect(
      vendorPaymentMethodSummaryLines({
        zellePaymentsEnabled: true,
        zelleContact: "pay@example.com",
        achPaymentsEnabled: true,
      }),
    ).toEqual(["Zelle: pay@example.com", "Bank (ACH) via Stripe Connect"]);
  });

  it("builds accepted methods array for save payloads", () => {
    expect(
      buildVendorAcceptedPaymentMethods({
        zellePaymentsEnabled: true,
        zelleContact: "pay@example.com",
        venmoPaymentsEnabled: false,
        venmoContact: "",
        achPaymentsEnabled: false,
      }),
    ).toEqual(["zelle"]);
  });

  it("labels unset methods", () => {
    expect(vendorPaymentMethodSummaryLabel(null)).toBe("No payment methods set");
    expect(
      vendorPaymentMethodSummaryLabel({
        zellePaymentsEnabled: true,
        zelleContact: "pay@example.com",
      }),
    ).toBe("Zelle");
  });
});
