import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("resident lease redirects", () => {
  it("does not collapse /resident/lease/* detail URLs back to the list", () => {
    const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");

    expect(config).toContain("never redirect it");

    const collapseLeaseSubpaths = /source:\s*"\/resident\/lease\/:path\+"/;
    expect(config).not.toMatch(collapseLeaseSubpaths);
  });
});
