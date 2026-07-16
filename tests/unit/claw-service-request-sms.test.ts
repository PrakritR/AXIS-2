import { describe, expect, it } from "vitest";
import { serviceRequestResidentAck } from "@/lib/claw-service-request-sms.server";
import { CUSTOM_SERVICE_REQUEST_OFFER_ID } from "@/lib/service-requests-storage";

describe("service request SMS ack", () => {
  it("acks newly filed requests with track link", () => {
    const ack = serviceRequestResidentAck({
      created: true,
      requestId: "SR-SMS-1",
      title: "Parking request",
    });
    expect(ack).toContain("Parking request");
    expect(ack).toMatch(/request/i);
    expect(ack).toMatch(/manager/i);
  });

  it("uses custom offer id constant", () => {
    expect(CUSTOM_SERVICE_REQUEST_OFFER_ID).toBe("custom");
  });
});
