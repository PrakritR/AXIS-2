import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PORTAL_METRICS_SOURCE = readFileSync(
  join(process.cwd(), "src/components/portal/portal-metrics.tsx"),
  "utf8",
);

const GLOBALS_CSS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

describe("portal mobile shell conventions", () => {
  it("stacks ManagerPortalPageShell header on narrow screens", () => {
    expect(PORTAL_METRICS_SOURCE).toContain("flex-col items-stretch gap-3 sm:flex-row");
  });

  it("uses horizontal scroll for status pills on mobile", () => {
    expect(PORTAL_METRICS_SOURCE).toContain("overflow-x-auto");
    expect(PORTAL_METRICS_SOURCE).toContain("sm:flex-wrap");
  });

  it("scopes nested scroll panels to desktop only", () => {
    expect(GLOBALS_CSS).toContain(".portal-desktop-scroll-panel");
    expect(GLOBALS_CSS).toContain("@media (min-width: 1024px)");
  });

  it("uses measured bottom nav inset on native main content", () => {
    expect(GLOBALS_CSS).toContain("padding-bottom: var(--portal-native-bottom-nav-inset)");
    expect(GLOBALS_CSS).toContain("scroll-padding-bottom: var(--portal-native-bottom-nav-inset)");
  });
});
