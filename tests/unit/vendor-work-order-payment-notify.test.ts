import { describe, expect, it } from "vitest";
import { buildVendorWorkOrderPaymentNotifyEmail } from "@/lib/vendor-work-order-payment-notify-email";

describe("buildVendorWorkOrderPaymentNotifyEmail", () => {
  const base = {
    vendorName: "Alex Plumbing",
    workOrderTitle: "HVAC seasonal tune-up",
    propertyLabel: "SoMa Loft House",
    unit: "Room 1",
    amountLabel: "$185.00",
  };

  it("builds a payment reminder", () => {
    const { subject, text } = buildVendorWorkOrderPaymentNotifyEmail({
      ...base,
      kind: "send_reminder",
    });
    expect(subject).toContain("Payment reminder");
    expect(subject).toContain("HVAC seasonal tune-up");
    expect(text).toContain("Alex Plumbing");
    expect(text).toContain("SoMa Loft House · Room 1");
    expect(text).toContain("$185.00");
  });

  it("builds a vendor-reported paid notice", () => {
    const { subject, text } = buildVendorWorkOrderPaymentNotifyEmail({
      ...base,
      kind: "report_paid",
    });
    expect(subject).toContain("payment received");
    expect(text).toContain("reports that payment was received");
    expect(text).toContain("Work Orders");
  });
});
