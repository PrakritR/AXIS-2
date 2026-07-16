import { describe, expect, it } from "vitest";
import {
  buildManagerPropLaneAssistantIntroSms,
  buildResidentPropLaneAssistantIntroSms,
} from "@/lib/claw-onboarding-sms";

describe("PropLane assistant intro copy", () => {
  it("resident intro sounds human, not like an AI assistant", () => {
    const text = buildResidentPropLaneAssistantIntroSms({ name: "Test Resident", axisId: "AX-1" });
    expect(text).toMatch(/Hey Test Resident/i);
    expect(text).not.toMatch(/messaging assistant/i);
    expect(text).not.toMatch(/PropLane resident menu/i);
    expect(text).toContain("AX-1");
    expect(text).toMatch(/STOP/i);
  });

  it("manager intro keeps ops clarity", () => {
    const text = buildManagerPropLaneAssistantIntroSms({ name: "Demo Manager" });
    expect(text).toContain("Hi Demo Manager!");
    expect(text).toMatch(/I'm your PropLane messaging assistant/i);
    expect(text).toMatch(/work orders|applications|payments/i);
    expect(text).toMatch(/PropLane line/i);
  });
});
