import { describe, expect, it } from "vitest";
import { formatDateDisplay, maskTypedDate, parseTypedDate } from "@/components/ui/date-field";

describe("maskTypedDate", () => {
  it("masks digit-only entry with auto-inserted slashes", () => {
    expect(maskTypedDate("0")).toBe("0");
    expect(maskTypedDate("03")).toBe("03");
    expect(maskTypedDate("031")).toBe("03/1");
    expect(maskTypedDate("0315")).toBe("03/15");
    expect(maskTypedDate("03152")).toBe("03/15/2");
    expect(maskTypedDate("03152027")).toBe("03/15/2027");
    // extra digits past a full 4-digit year are ignored
    expect(maskTypedDate("031520279")).toBe("03/15/2027");
  });

  it("honors separators the user types, padding short month/day", () => {
    // The exact case that a positional mask mangled into 31/52/027.
    expect(maskTypedDate("3/15/2027")).toBe("03/15/2027");
    expect(maskTypedDate("3/1/2027")).toBe("03/01/2027");
    expect(maskTypedDate("3/")).toBe("03/");
    expect(maskTypedDate("12/31/2025")).toBe("12/31/2025");
  });

  it("accepts '-' and '.' as separators too", () => {
    expect(maskTypedDate("3-15-2027")).toBe("03/15/2027");
    expect(maskTypedDate("3.15.2027")).toBe("03/15/2027");
  });

  it("keeps a digit typist's overflow flowing into the year after an auto-slash", () => {
    // Reproduces the mid-typing state after the mask auto-inserted a slash:
    // "03/15" is on screen, the user types "2" -> the browser value is "03/152".
    expect(maskTypedDate("03/152")).toBe("03/15/2");
    expect(maskTypedDate("03/152027")).toBe("03/15/2027");
  });
});

describe("parseTypedDate", () => {
  it("parses ISO, US numeric (2- and 4-digit year), and month-name forms", () => {
    expect(parseTypedDate("2027-03-15")).toBe("2027-03-15");
    expect(parseTypedDate("03/15/2027")).toBe("2027-03-15");
    expect(parseTypedDate("3/15/2027")).toBe("2027-03-15");
    expect(parseTypedDate("7-31-26")).toBe("2026-07-31");
    expect(parseTypedDate("July 31, 2026")).toBe("2026-07-31");
    expect(parseTypedDate("Jul 31 2026")).toBe("2026-07-31");
  });

  it("rejects impossible calendar dates", () => {
    expect(parseTypedDate("13/01/2026")).toBeNull(); // month 13
    expect(parseTypedDate("02/30/2026")).toBeNull(); // Feb 30
    expect(parseTypedDate("")).toBeNull();
    expect(parseTypedDate("03/15")).toBeNull(); // incomplete
  });
});

describe("formatDateDisplay", () => {
  it("renders a strict ISO string as MM/DD/YYYY and nothing else", () => {
    expect(formatDateDisplay("2027-03-15")).toBe("03/15/2027");
    expect(formatDateDisplay("")).toBe("");
    expect(formatDateDisplay("2027-3-5")).toBe("");
  });
});
