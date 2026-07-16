import { describe, expect, it } from "vitest";
import { managerNeedsWorkNumber } from "@/lib/backfill-manager-work-numbers.server";

describe("managerNeedsWorkNumber", () => {
  it("treats empty numbers as needing provision", () => {
    expect(managerNeedsWorkNumber(null)).toBe(true);
    expect(managerNeedsWorkNumber("")).toBe(true);
    expect(managerNeedsWorkNumber("   ")).toBe(true);
  });

  it("treats a real Twilio number as provisioned", () => {
    expect(managerNeedsWorkNumber("+14258909021")).toBe(false);
  });

  it("treats the legacy shared Claw line as needing replacement when bridge is off", () => {
    const prev = process.env.NEXT_PUBLIC_CLAW_MESSENGER_ENABLED;
    delete process.env.NEXT_PUBLIC_CLAW_MESSENGER_ENABLED;
    expect(managerNeedsWorkNumber("+12053690702")).toBe(true);
    if (prev === undefined) delete process.env.NEXT_PUBLIC_CLAW_MESSENGER_ENABLED;
    else process.env.NEXT_PUBLIC_CLAW_MESSENGER_ENABLED = prev;
  });

  it("keeps the shared Claw line when the bridge is on", () => {
    const prev = process.env.NEXT_PUBLIC_CLAW_MESSENGER_ENABLED;
    process.env.NEXT_PUBLIC_CLAW_MESSENGER_ENABLED = "1";
    expect(managerNeedsWorkNumber("+12053690702")).toBe(false);
    if (prev === undefined) delete process.env.NEXT_PUBLIC_CLAW_MESSENGER_ENABLED;
    else process.env.NEXT_PUBLIC_CLAW_MESSENGER_ENABLED = prev;
  });

  it("treats fictional 555 placeholders as needing replacement", () => {
    expect(managerNeedsWorkNumber("+12065550100")).toBe(true);
  });
});
