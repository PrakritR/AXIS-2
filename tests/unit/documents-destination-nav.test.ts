// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DOCUMENT_NAV_GROUPS, documentGroupIdForTab } from "@/components/portal/documents-destination-nav";

describe("documents destination nav", () => {
  it("maps every document tab to a group", () => {
    const allTabIds = DOCUMENT_NAV_GROUPS.flatMap((group) => group.tabIds);
    expect(allTabIds).toContain("library");
    expect(allTabIds).toContain("tax-summary");
    expect(documentGroupIdForTab("library")).toBe("files");
    expect(documentGroupIdForTab("leases")).toBe("leasing");
    expect(documentGroupIdForTab("1099")).toBe("reports");
  });

  it("uses full-width equal sub-tabs like Payments", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/portal/documents-destination-nav.tsx"),
      "utf8",
    );
    expect(source).toContain('itemLayout="equal"');
    expect(source).toContain("denseEqualRow");
    expect(source).not.toContain("LocalDestinationNav");
  });
});
