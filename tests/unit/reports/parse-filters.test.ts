import { describe, expect, it } from "vitest";
import { parseManagerReportFilters, resolveDocumentScope } from "@/lib/reports/parse-filters";

describe("parseManagerReportFilters", () => {
  it("parses document scope params", () => {
    const params = new URLSearchParams({
      scope: "room",
      propertyId: "prop-1",
      residentEmail: "a@test.com",
      roomLabel: "mgr-seed-4709b-8th-ave-ne::seed-4709b-room-3",
      from: "2026-01-01",
      to: "2026-06-30",
    });
    expect(parseManagerReportFilters(params)).toMatchObject({
      scope: "room",
      propertyId: "prop-1",
      residentEmail: "a@test.com",
      roomLabel: "mgr-seed-4709b-8th-ave-ne::seed-4709b-room-3",
      from: "2026-01-01",
      to: "2026-06-30",
    });
  });
});

describe("resolveDocumentScope", () => {
  it("prefers explicit scope", () => {
    expect(resolveDocumentScope({ scope: "portfolio", propertyId: "prop-1" })).toBe("portfolio");
  });

  it("infers scope from filters", () => {
    expect(resolveDocumentScope({ roomLabel: "room-1" })).toBe("room");
    expect(resolveDocumentScope({ residentEmail: "a@test.com" })).toBe("tenant");
    expect(resolveDocumentScope({ propertyId: "prop-1" })).toBe("property");
    expect(resolveDocumentScope({})).toBe("portfolio");
  });
});
