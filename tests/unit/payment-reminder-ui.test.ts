import { describe, expect, it } from "vitest";
import { paymentReminderRecipientLabel } from "@/lib/payment-reminder-ui";

describe("paymentReminderRecipientLabel", () => {
  it("prefers resident name with role label", () => {
    expect(
      paymentReminderRecipientLabel({
        residentName: "Maya Chen",
        residentEmail: "maya.chen.workflow@test.axis.local",
      }),
    ).toBe("Maya Chen (Resident)");
  });

  it("falls back to email when name is missing", () => {
    expect(
      paymentReminderRecipientLabel({
        residentName: "",
        residentEmail: "resident@test.com",
      }),
    ).toBe("resident@test.com");
  });

  it("falls back to Resident when both are missing", () => {
    expect(paymentReminderRecipientLabel({ residentName: "", residentEmail: "" })).toBe("Resident");
  });
});
