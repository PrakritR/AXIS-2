import { describe, expect, it } from "vitest";
import { normalizePropertyAccessInfo, overlayWorkOrderAccess } from "@/lib/property-access-info";

describe("normalizePropertyAccessInfo", () => {
  it("trims strings and drops empties", () => {
    const info = normalizePropertyAccessInfo({
      gateCode: " 4821 ",
      lockboxCode: "",
      lockboxLocation: "  by the side door ",
      entryNotes: "   ",
      permissionToEnterDefault: true,
    });
    expect(info).toEqual({
      gateCode: "4821",
      lockboxCode: undefined,
      lockboxLocation: "by the side door",
      entryNotes: undefined,
      permissionToEnterDefault: true,
    });
  });

  it("survives junk input", () => {
    expect(normalizePropertyAccessInfo(null).gateCode).toBeUndefined();
    expect(normalizePropertyAccessInfo("junk").gateCode).toBeUndefined();
    expect(normalizePropertyAccessInfo({ gateCode: 4821 }).gateCode).toBeUndefined();
  });
});

describe("overlayWorkOrderAccess", () => {
  const defaults = { gateCode: "4821", permissionToEnterDefault: true };

  it("resident answer beats the property default", () => {
    const merged = overlayWorkOrderAccess(defaults, { entryPermission: "call_first", entryNotes: "dog inside" });
    expect(merged.permissionToEnter).toBe("call_first");
    expect(merged.residentEntryNotes).toBe("dog inside");
    expect(merged.gateCode).toBe("4821");
  });

  it("falls back to the property default when the resident did not answer", () => {
    expect(overlayWorkOrderAccess(defaults, {}).permissionToEnter).toBe("allowed");
    expect(overlayWorkOrderAccess({ permissionToEnterDefault: false }, {}).permissionToEnter).toBeUndefined();
    expect(overlayWorkOrderAccess({}, {}).permissionToEnter).toBeUndefined();
  });
});
