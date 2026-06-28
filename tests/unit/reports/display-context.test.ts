import { describe, expect, it } from "vitest";
import { humanizePropertyId } from "@/lib/reports/display-context";

describe("report display names", () => {
  it("humanizes internal seed property ids into readable addresses", () => {
    expect(humanizePropertyId("mgr-seed-4709b-8th-ave-ne")).toBe("4709B 8th Ave NE");
    expect(humanizePropertyId("mgr-seed-5259-brooklyn-ave-ne")).toBe("5259 Brooklyn Ave NE");
  });

  it("returns plain labels unchanged", () => {
    expect(humanizePropertyId("4709A 8th Ave NE - 10 rooms")).toBe("4709A 8th Ave NE - 10 rooms");
  });
});
