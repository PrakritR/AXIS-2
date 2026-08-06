import { describe, expect, it } from "vitest";

import {
  buildResidentChargeMessageBody,
  buildResidentChargeMessageSubject,
  sanitizeResidentChargeMessageBody,
} from "@/lib/resident-charge-message.server";
import type { HouseholdCharge } from "@/lib/household-charges";

const sampleCharge: HouseholdCharge = {
  id: "hc_test",
  createdAt: "2026-01-01T00:00:00.000Z",
  residentEmail: "resident@test.proplane.local",
  residentName: "Test Resident",
  residentUserId: "user-1",
  propertyId: "prop-1",
  propertyLabel: "Oak House",
  managerUserId: "mgr-1",
  kind: "rent",
  title: "March rent",
  amountLabel: "$1,200.00",
  balanceLabel: "$1,200.00",
  status: "pending",
  blocksLeaseUntilPaid: false,
};

describe("resident charge message helpers", () => {
  it("sanitizes and caps message bodies", () => {
    expect(sanitizeResidentChargeMessageBody("  hello\u0007world  ")).toBe("helloworld");
    expect(sanitizeResidentChargeMessageBody("x".repeat(2500)).length).toBe(2000);
  });

  it("builds manager-facing subject and body with charge context", () => {
    expect(buildResidentChargeMessageSubject(sampleCharge)).toBe("Question about March rent");
    expect(buildResidentChargeMessageBody(sampleCharge, "This looks wrong.")).toContain("March rent");
    expect(buildResidentChargeMessageBody(sampleCharge, "This looks wrong.")).toContain("This looks wrong.");
  });
});

describe("sendResidentChargeMessage", () => {
  it("rejects short messages", async () => {
    const { sendResidentChargeMessage } = await import("@/lib/resident-charge-message.server");
    const db = {} as never;
    const result = await sendResidentChargeMessage(db, {
      userId: "user-1",
      userEmail: "resident@test.proplane.local",
      residentName: "Test Resident",
      chargeId: "hc_test",
      message: "ok",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });
});
