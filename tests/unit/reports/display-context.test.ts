import { describe, expect, it } from "vitest";
import { humanizePropertyId, humanizeUnitLabel } from "@/lib/reports/display-context";
import { scopeLabel } from "@/lib/reports/formal-documents/spec";

describe("report display names", () => {
  it("humanizes internal seed property ids into readable addresses", () => {
    expect(humanizePropertyId("mgr-seed-4709b-8th-ave-ne")).toBe("4709B 8th Ave NE");
    expect(humanizePropertyId("mgr-seed-5259-brooklyn-ave-ne")).toBe("5259 Brooklyn Ave NE");
  });

  it("returns plain labels unchanged", () => {
    expect(humanizePropertyId("4709A 8th Ave NE - 10 rooms")).toBe("4709A 8th Ave NE - 10 rooms");
  });

  it("humanizes internal seed room ids into readable room labels", () => {
    expect(humanizeUnitLabel("seed-4709b-room-3")).toBe("Room 3");
    expect(humanizeUnitLabel("mgr-seed-4709b-8th-ave-ne::seed-4709b-room-3")).toBe("Room 3");
    expect(humanizeUnitLabel("mgr-seed-5259-brooklyn-ave-ne::seed-5259-brooklyn-room-1")).toBe("Room 1");
  });

  it("humanizes room scope labels for formal documents", () => {
    expect(
      scopeLabel("room", undefined, undefined, "mgr-seed-4709b-8th-ave-ne::seed-4709b-room-3"),
    ).toBe("Room 3");
  });
});
