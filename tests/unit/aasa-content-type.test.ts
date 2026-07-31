import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("apple-app-site-association headers", () => {
  it("serves AASA as application/json", () => {
    const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
    expect(config).toContain("/.well-known/apple-app-site-association");
    expect(config).toContain('"application/json"');
  });
});
