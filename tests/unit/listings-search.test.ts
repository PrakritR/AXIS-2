import { describe, expect, it } from "vitest";
import {
  parseMonthlyRent,
  parseRadiusParam,
  parseUSZip,
  propertyMatchesZipRadius,
  propertyWithinMaxBudget,
} from "@/lib/listings-search";

describe("listings-search", () => {
  it("parses US zip codes", () => {
    expect(parseUSZip("98105")).toBe(98105);
    expect(parseUSZip("98abc")).toBeNull();
  });

  it("matches zip radius", () => {
    expect(propertyMatchesZipRadius("98105", "98101", 10)).toBe(true);
    expect(propertyMatchesZipRadius("99999", "98101", 5)).toBe(false);
  });

  it("parses radius param", () => {
    expect(parseRadiusParam("25")).toBe(25);
    expect(parseRadiusParam("99")).toBe(10);
  });

  it("parses monthly rent and budget", () => {
    expect(parseMonthlyRent("$850/mo")).toBe(850);
    expect(propertyWithinMaxBudget("$850/mo", 900)).toBe(true);
    expect(propertyWithinMaxBudget("$950/mo", 900)).toBe(false);
  });
});
