import { describe, expect, it } from "vitest";
import { buildResidentWorkOrderReminderEmail } from "@/lib/resident-work-order-reminder-email";

describe("buildResidentWorkOrderReminderEmail", () => {
  const base = {
    residentName: "Jordan Lee",
    workOrderTitle: "Leaky kitchen faucet",
    propertyLabel: "SoMa Loft House",
    unit: "Room 1",
    priority: "High",
    preferredArrival: "After 5pm",
    description: "Water dripping under the sink.",
    workOrderId: "REQ-123",
  };

  it("builds a pending work order reminder", () => {
    const { subject, text } = buildResidentWorkOrderReminderEmail(base);
    expect(subject).toContain("Reminder");
    expect(subject).toContain("Leaky kitchen faucet");
    expect(text).toContain("Jordan Lee");
    expect(text).toContain("SoMa Loft House · Room 1");
    expect(text).toContain("After 5pm");
    expect(text).toContain("REQ-123");
  });
});
