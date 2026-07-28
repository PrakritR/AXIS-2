import { describe, expect, it } from "vitest";

import {
  DEFAULT_MANAGER_MANUAL_PAYMENT_SETTINGS,
  normalizeManagerManualPaymentSettings,
} from "@/lib/manager-manual-payment-settings";

describe("manager manual payment settings", () => {
  it("defaults to all methods off", () => {
    expect(normalizeManagerManualPaymentSettings(null)).toEqual(DEFAULT_MANAGER_MANUAL_PAYMENT_SETTINGS);
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
    });
  });
});
