import { describe, expect, it } from "vitest";
import { managerNeedsWorkNumber } from "@/lib/backfill-manager-work-numbers.server";

describe("managerNeedsWorkNumber", () => {
  it("treats empty numbers as needing provision", () => {
    expect(managerNeedsWorkNumber(null)).toBe(true);
    expect(managerNeedsWorkNumber("")).toBe(true);
    expect(managerNeedsWorkNumber("   ")).toBe(true);
  });

  it("treats a real Twilio number as provisioned", () => {
    expect(managerNeedsWorkNumber("+12065551234")).toBe(false);
  });

  it("treats the legacy shared Claw line as needing replacement", () => {
    expect(managerNeedsWorkNumber("+12053690702")).toBe(true);
  });
});
