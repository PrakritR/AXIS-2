import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("admin bugs-feedback redirects", () => {
  it("keeps /admin/bugs-feedback as a live route (no profile redirect)", () => {
    const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");

    expect(config).toContain("do NOT redirect /admin/bugs-feedback");

    const profileRedirect = /source:\s*"\/admin\/bugs-feedback[^"]*"[^}]*destination:\s*"\/admin\/profile"/s;
    expect(config).not.toMatch(profileRedirect);
  });
});
