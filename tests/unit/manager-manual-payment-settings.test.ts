import { describe, expect, it } from "vitest";

import {
  DEFAULT_MANAGER_MANUAL_PAYMENT_SETTINGS,
  normalizeManagerManualPaymentSettings,
} from "@/lib/manager-manual-payment-settings";

describe("manager manual payment settings", () => {
  it("defaults to Stripe ACH on, Zelle/Venmo off, with receipt linking on", () => {
    expect(normalizeManagerManualPaymentSettings(null)).toEqual({
      ...DEFAULT_MANAGER_MANUAL_PAYMENT_SETTINGS,
      receiptAutoMarkEnabled: true,
    });
  });

  it("requires a contact when a method is enabled, but keeps the contact when disabled", () => {
    expect(
      normalizeManagerManualPaymentSettings({
        zellePaymentsEnabled: true,
        zelleContact: "  ",
        venmoPaymentsEnabled: true,
        venmoContact: "@payme",
      }),
    ).toEqual({
      axisPaymentsEnabled: true,
      zellePaymentsEnabled: false,
      zelleContact: "",
      venmoPaymentsEnabled: true,
      venmoContact: "@payme",
      receiptAutoMarkEnabled: true,
      serviceFeePayer: "resident",
    });

    expect(
      normalizeManagerManualPaymentSettings({
        zellePaymentsEnabled: false,
        zelleContact: "keep@example.com",
        venmoPaymentsEnabled: false,
        venmoContact: "",
      }),
    ).toEqual({
      axisPaymentsEnabled: true,
      zellePaymentsEnabled: false,
      zelleContact: "keep@example.com",
      venmoPaymentsEnabled: false,
      venmoContact: "",
      receiptAutoMarkEnabled: true,
      serviceFeePayer: "resident",
    });
  });

  it("sanitizes contacts and respects axisPaymentsEnabled", () => {
    expect(
      normalizeManagerManualPaymentSettings({
        axisPaymentsEnabled: false,
        zellePaymentsEnabled: true,
        zelleContact: "name@email.com",
        venmoPaymentsEnabled: false,
        venmoContact: "",
      }),
    ).toEqual({
      axisPaymentsEnabled: false,
      zellePaymentsEnabled: true,
      zelleContact: "name@email.com",
      venmoPaymentsEnabled: false,
      venmoContact: "",
      receiptAutoMarkEnabled: true,
      serviceFeePayer: "resident",
    });
  });
});
