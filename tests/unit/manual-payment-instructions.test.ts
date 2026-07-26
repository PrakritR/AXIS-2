import { describe, expect, it } from "vitest";

import {
  buildManualPaymentInstructionLines,
  buildPaymentReminderBody,
  chargePaymentReference,
} from "@/lib/manual-payment-instructions";

describe("manual payment instructions", () => {
  it("builds Zelle and Venmo lines with reference", () => {
    const lines = buildManualPaymentInstructionLines({
      id: "hc_test",
      balanceLabel: "$500.00",
      amountLabel: "$500.00",
      zelleContactSnapshot: "pay@example.com",
      venmoContactSnapshot: "@landlord",
      paymentReference: "PL-ABC123",
    });
    expect(lines.join("\n")).toContain("Zelle");
    expect(lines.join("\n")).toContain("pay@example.com");
    expect(lines.join("\n")).toContain("Venmo");
    expect(lines.join("\n")).toContain("@landlord");
    expect(lines.join("\n")).toContain("PL-ABC123");
  });

  it("generates stable payment reference from charge id", () => {
    expect(chargePaymentReference({ id: "hc_rent_1" })).toMatch(/^PL-/);
  });

  it("includes manual payment lines in reminder body", () => {
    const body = buildPaymentReminderBody({
      residentName: "Alex",
      chargeTitle: "March rent",
      balanceDue: "$1,200.00",
      dueDate: "Mar 1",
      propertyLabel: "Oak House",
      managerName: "Sam",
      manualPaymentLines: ["", "• Zelle: send $1,200.00 to pay@example.com"],
    });
    expect(body).toContain("Alex");
    expect(body).toContain("Zelle");
    expect(body).not.toContain("log in to your PropLane");
  });
});
