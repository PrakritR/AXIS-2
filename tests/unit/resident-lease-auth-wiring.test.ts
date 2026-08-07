import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("resident lease auth wiring", () => {
  it("passes profileManagerId separately from residentAxisId in lease panel", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/portal/resident-lease-panel.tsx"),
      "utf8",
    );
    expect(source).not.toContain("profileManagerId: residentAxisId");
    expect(source).toContain("profileManagerId,");
  });

  it("scopes dashboard lease lookup through resident axis context", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/portal/resident-dashboard.tsx"),
      "utf8",
    );
    expect(source).toContain("useResidentPortalAxisContext");
    expect(source).toContain("findLeaseForResidentEmail(email, { email, residentAxisId, profileManagerId })");
  });
});
