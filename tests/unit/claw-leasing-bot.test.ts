import { describe, expect, it } from "vitest";
import {
  buildSmsDeepLink,
  classifyLeasingIntent,
  extractPropertyIdHint,
} from "@/lib/claw-leasing-bot.server";

describe("claw leasing intent", () => {
  it("classifies tour / apply / lease / help", () => {
    expect(classifyLeasingIntent("I'd like a tour this week")).toBe("tour");
    expect(classifyLeasingIntent("Can I apply for the room?")).toBe("apply");
    expect(classifyLeasingIntent("Ready to sign the lease")).toBe("lease");
    expect(classifyLeasingIntent("help")).toBe("help");
    expect(classifyLeasingIntent("Hi")).toBe("greeting");
  });

  it("extracts propertyId hints from sms bodies", () => {
    expect(extractPropertyIdHint("tour propertyId=mgr-house-1")).toBe("mgr-house-1");
    expect(extractPropertyIdHint("listing # abcdef123456")).toBe("abcdef123456");
  });

  it("builds sms deep links to the shared agent line", () => {
    const href = buildSmsDeepLink({
      intent: "tour",
      propertyId: "mgr-1",
      propertyLabel: "4709B 8th Ave NE",
    });
    expect(href.startsWith("sms:")).toBe(true);
    expect(href).toContain("body=");
    expect(decodeURIComponent(href)).toContain("tour");
    expect(decodeURIComponent(href)).toContain("propertyId=mgr-1");
  });
});
