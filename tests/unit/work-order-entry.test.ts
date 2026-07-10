import { describe, expect, it } from "vitest";
import { ENTRY_PERMISSION_OPTIONS, entryPermissionLabel } from "@/lib/work-order-entry";

describe("entryPermissionLabel", () => {
  it("maps each entry permission value to its label", () => {
    expect(entryPermissionLabel("allowed")).toBe("Yes, they can enter");
    expect(entryPermissionLabel("call_first")).toBe("Call me first");
    expect(entryPermissionLabel("resident_present")).toBe("No - I'll be home");
  });

  it("defaults to Call me first for undefined or unrecognized values", () => {
    expect(entryPermissionLabel(undefined)).toBe("Call me first");
    expect(entryPermissionLabel("something-else")).toBe("Call me first");
  });

  it("exposes one option per entry permission value", () => {
    expect(ENTRY_PERMISSION_OPTIONS.map((option) => option.value)).toEqual([
      "allowed",
      "call_first",
      "resident_present",
    ]);
  });
});
