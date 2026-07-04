import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PORTAL_SIDEBAR_SOURCE = readFileSync(
  join(process.cwd(), "src/components/portal/portal-sidebar.tsx"),
  "utf8",
);

const PORTAL_NAV_CLIENT_SOURCE = readFileSync(
  join(process.cwd(), "src/lib/portal-nav-client.ts"),
  "utf8",
);

describe("portal sidebar native hydration", () => {
  it("uses useNativeChrome instead of sync Capacitor detect during render", () => {
    expect(PORTAL_SIDEBAR_SOURCE).toContain("useNativeChrome");
    expect(PORTAL_SIDEBAR_SOURCE).not.toContain("detectNativePlatformSync");
  });

  it("keeps mobile chrome in the SSR tree (hidden via html[data-native] CSS)", () => {
    expect(PORTAL_SIDEBAR_SOURCE).toContain("PORTAL_MOBILE_CHROME_CLASS");
    expect(PORTAL_SIDEBAR_SOURCE).not.toContain("!showNativeChrome ?");
  });

  it("only forces full navigation on native bottom tab taps that leave the portal", () => {
    expect(PORTAL_SIDEBAR_SOURCE).toContain("isCrossPortalNavigation(pathname, s.href)");
    expect(PORTAL_NAV_CLIENT_SOURCE).toContain("preferFullNavigation");
    expect(PORTAL_NAV_CLIENT_SOURCE).toContain("isCrossPortalNavigation");
  });
});
