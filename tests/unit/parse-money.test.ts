import { describe, expect, it } from "vitest";
import { parseMoneyAmount } from "@/lib/parse-money";

describe("parse-money", () => {
  it("parses dollar labels", () => {
    expect(parseMoneyAmount("$1,250.50")).toBe(1250.5);
    expect(parseMoneyAmount("50")).toBe(50);
    expect(parseMoneyAmount("no money")).toBe(0);
  });
});
