import { describe, expect, it } from "vitest";
import {
  shortTermNightlyRate,
  shortTermStayChargeTitle,
  shortTermStayNightCount,
  shortTermStayTotalAmount,
} from "@/lib/short-term-stay-pricing";

describe("shortTermStayNightCount", () => {
  it("counts inclusive nights between check-in and check-out", () => {
    expect(shortTermStayNightCount("2026-03-10", "2026-03-16")).toBe(7);
  });

  it("returns 1 for a same-day stay span", () => {
    expect(shortTermStayNightCount("2026-03-10", "2026-03-10")).toBe(1);
  });

  it("returns null when dates are missing", () => {
    expect(shortTermStayNightCount("", "2026-03-16")).toBeNull();
  });
});

describe("shortTermStayTotalAmount", () => {
  it("multiplies nightly rate by nights", () => {
    expect(shortTermStayTotalAmount(85, 7)).toBe(595);
  });

  it("returns 0 when rate or nights are invalid", () => {
    expect(shortTermStayTotalAmount(0, 7)).toBe(0);
    expect(shortTermStayTotalAmount(85, 0)).toBe(0);
  });
});

describe("shortTermNightlyRate", () => {
  it("parses dollar strings", () => {
    expect(shortTermNightlyRate("$85")).toBe(85);
    expect(shortTermNightlyRate("40.50")).toBe(40.5);
  });

  it("defaults blank to zero", () => {
    expect(shortTermNightlyRate("")).toBe(0);
    expect(shortTermNightlyRate(undefined)).toBe(0);
  });
});

describe("shortTermStayChargeTitle", () => {
  it("formats the stay total line shown in payments", () => {
    expect(shortTermStayChargeTitle(7, 85)).toBe("Stay total (7 nights × $85)");
    expect(shortTermStayChargeTitle(1, 85)).toBe("Stay total (1 night × $85)");
  });
});
