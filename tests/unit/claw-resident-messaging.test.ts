import { describe, expect, it } from "vitest";
import {
  clawDefaultResidentPhoneFromEnv,
  labelClawSmsFromManager,
  labelClawSmsFromPropLaneForManager,
  labelClawSmsFromResident,
  residentInboundAck,
} from "@/lib/claw-resident-messaging.server";

describe("residentInboundAck", () => {
  it("returns natural confirmations with links when useful", () => {
    const payment = residentInboundAck("payment");
    expect(payment.toLowerCase()).toContain("payment");
    expect(payment).toMatch(/https?:\/\//);
    expect(payment).toContain("/resident/payments/pending");
    expect(payment).not.toMatch(/property manager will see this and reply here/i);

    const lease = residentInboundAck("lease");
    expect(lease.toLowerCase()).toContain("lease");
    expect(lease).toContain("/resident/lease");

    const general = residentInboundAck("general");
    expect(general.toLowerCase()).toContain("manager");
    expect(general).not.toMatch(/PropLane/i);
  });
});

describe("Claw SMS sender labels", () => {
  it("labels manager→resident relay for the resident", () => {
    expect(labelClawSmsFromManager("Hello")).toBe("(Your property manager)\nHello");
  });

  it("labels resident→manager relay for the manager", () => {
    expect(labelClawSmsFromResident("hey", "+15105794001")).toBe(
      ["Property: Unknown property", "Resident: Resident (+15105794001)", "Said: hey"].join("\n"),
    );
  });

  it("labels automated carbon-copy for the manager; resident keeps plain text", () => {
    const plain = "Rent is due Friday.";
    expect(labelClawSmsFromPropLaneForManager(plain)).toBe(
      ["Property: Unknown property", "Resident: Resident", `Sent: ${plain}`].join("\n"),
    );
    expect(
      labelClawSmsFromPropLaneForManager(plain, {
        propertyLabel: "The Pioneer",
        residentName: "Test Resident",
        residentPhone: "+15105794001",
      }),
    ).toBe(
      [
        "Property: The Pioneer",
        "Resident: Test Resident (+15105794001)",
        `Sent: ${plain}`,
      ].join("\n"),
    );
  });

  it("defaults the resident pairing phone used when no thread exists", () => {
    expect(clawDefaultResidentPhoneFromEnv()).toBe("+15105794001");
  });
});
