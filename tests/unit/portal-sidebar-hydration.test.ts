import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PORTAL_SIDEBAR_SOURCE = readFileSync(
  join(process.cwd(), "src/components/portal/portal-sidebar.tsx"),
  "utf8",
);

describe("portal sidebar native hydration", () => {
  it("defers native chrome until useIsNativeApp resolves (no sync Capacitor detect on render)", () => {
    expect(PORTAL_SIDEBAR_SOURCE).toContain("const showNativeChrome = isNative === true");
    expect(PORTAL_SIDEBAR_SOURCE).not.toContain("detectNativePlatformSync");
  });
});
