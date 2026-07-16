import { describe, expect, it } from "vitest";
import {
  clawDefaultResidentPhoneFromEnv,
  labelClawSmsFromManager,
  labelClawSmsFromPropLaneForManager,
  labelClawSmsFromResident,
  residentInboundAck,
} from "@/lib/claw-resident-messaging.server";

describe("residentInboundAck", () => {
  it("returns topic-specific confirmation copy with portal links", () => {
    const payment = residentInboundAck("payment");
    expect(payment.toLowerCase()).toContain("payment");
    expect(payment).toMatch(/https?:\/\//);
    expect(payment).toContain("/resident/payments/pending");

    const lease = residentInboundAck("lease");
    expect(lease.toLowerCase()).toContain("lease");
    expect(lease).toContain("/resident/lease");

    const general = residentInboundAck("general");
    expect(general.toLowerCase()).toContain("manager");
    expect(general).toContain("/resident/inbox");
  });
});

describe("Claw SMS sender labels", () => {
  it("labels manager→resident relay for the resident", () => {
    expect(labelClawSmsFromManager("Hello")).toBe("From your property manager:\nHello");
  });

  it("labels resident→manager relay for the manager", () => {
    expect(labelClawSmsFromResident("hey", "+15105791976")).toBe(
      "From resident (+15105791976):\nhey",
    );
  });

  it("labels automated carbon-copy for the manager; resident keeps plain text", () => {
    const plain = "Rent is due Friday.";
    expect(labelClawSmsFromPropLaneForManager(plain)).toBe(
      "From PropLane (sent to resident):\nRent is due Friday.",
    );
  });

  it("defaults the resident pairing phone used when no thread exists", () => {
    expect(clawDefaultResidentPhoneFromEnv()).toBe("+15105791976");
  });
});
