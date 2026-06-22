import { describe, expect, it } from "vitest";
import { formatPacificDate, safeFormatDateTime } from "@/lib/pacific-time";

describe("pacific-time", () => {
  it("formats dates in Pacific time", () => {
    const formatted = formatPacificDate("2026-06-15", { month: "short", day: "numeric", year: "numeric" });
    expect(formatted).toContain("2026");
  });

  it("returns fallback for invalid datetime", () => {
    expect(safeFormatDateTime("not-a-date", "N/A")).toBe("N/A");
  });
});
