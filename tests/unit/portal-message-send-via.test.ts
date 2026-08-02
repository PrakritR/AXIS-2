import { describe, expect, it } from "vitest";
import {
  portalMessageSendViaModeToSelection,
  portalMessageSendViaToMode,
} from "@/components/portal/portal-message-compose-fields";

describe("portalMessageSendVia mode helpers", () => {
  it("maps selection arrays to modes", () => {
    expect(portalMessageSendViaToMode(["email"])).toBe("email");
    expect(portalMessageSendViaToMode(["sms"])).toBe("sms");
    expect(portalMessageSendViaToMode(["email", "sms"])).toBe("both");
  });

  it("maps modes back to selection arrays", () => {
    expect(portalMessageSendViaModeToSelection("email")).toEqual(["email"]);
    expect(portalMessageSendViaModeToSelection("sms")).toEqual(["sms"]);
    expect(portalMessageSendViaModeToSelection("both")).toEqual(["email", "sms"]);
  });
});
