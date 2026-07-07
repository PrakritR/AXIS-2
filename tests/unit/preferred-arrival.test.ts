import { describe, expect, it } from "vitest";
import {
  formatPreferredArrival,
  parsePreferredArrival,
  PREFERRED_ARRIVAL_CUSTOM,
} from "@/lib/preferred-arrival";

describe("preferred-arrival", () => {
  it("parses preset values", () => {
    expect(parsePreferredArrival("After 5pm weekdays")).toEqual({
      preset: "After 5pm weekdays",
      custom: "",
    });
  });

  it("parses unknown values as custom", () => {
    expect(parsePreferredArrival("Tuesday before noon")).toEqual({
      preset: PREFERRED_ARRIVAL_CUSTOM,
      custom: "Tuesday before noon",
    });
  });

  it("formats preset and custom selections", () => {
    expect(formatPreferredArrival("Weekends only", "")).toBe("Weekends only");
    expect(formatPreferredArrival(PREFERRED_ARRIVAL_CUSTOM, "Tuesday before noon")).toBe("Tuesday before noon");
    expect(formatPreferredArrival(PREFERRED_ARRIVAL_CUSTOM, "")).toBe("Anytime");
  });
});
