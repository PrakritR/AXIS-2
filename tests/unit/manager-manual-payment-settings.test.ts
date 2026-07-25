import { describe, expect, it } from "vitest";

import {
  DEFAULT_MANAGER_MANUAL_PAYMENT_SETTINGS,
  normalizeManagerManualPaymentSettings,
} from "@/lib/manager-manual-payment-settings";

describe("manager manual payment settings", () => {
  it("defaults to all methods off with receipt linking on", () => {
    expect(normalizeManagerManualPaymentSettings(null)).toEqual({
      ...DEFAULT_MANAGER_MANUAL_PAYMENT_SETTINGS,
      receiptAutoMarkEnabled: true,
    });
  });

  it("requires a contact when a method is enabled", () => {
    expect(
      normalizeManagerManualPaymentSettings({
        zellePaymentsEnabled: true,
        zelleContact: "  ",
        venmoPaymentsEnabled: true,
        venmoContact: "@payme",
      }),
    ).toEqual({
      zellePaymentsEnabled: false,
      zelleContact: "",
      venmoPaymentsEnabled: true,
      venmoContact: "@payme",
      receiptAutoMarkEnabled: true,
    });
  });

  it("sanitizes contacts", () => {
    expect(
      normalizeManagerManualPaymentSettings({
        zellePaymentsEnabled: true,
        zelleContact: "name@email.com",
        venmoPaymentsEnabled: false,
        venmoContact: "",
      }),
    ).toEqual({
      zellePaymentsEnabled: true,
      zelleContact: "name@email.com",
      venmoPaymentsEnabled: false,
      venmoContact: "",
      receiptAutoMarkEnabled: true,
    });
  });
});
