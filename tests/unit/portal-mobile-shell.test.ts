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

  it("uses native safe-area top padding on portal main content", () => {
    expect(GLOBALS_CSS).toContain("html[data-native] #portal-main-content");
    expect(GLOBALS_CSS).toContain("padding-top: max(0.5rem, calc(var(--native-safe-top) + 0.25rem))");
    expect(GLOBALS_CSS).toContain("scroll-padding-top: max(0.5rem, calc(var(--native-safe-top) + 0.25rem))");
  });

  it("pins native bottom nav flush to screen bottom", () => {
    expect(GLOBALS_CSS).toContain("html[data-native] .portal-native-bottom-nav");
    expect(GLOBALS_CSS).toContain("align-items: flex-end");
    expect(GLOBALS_CSS).toContain("bottom: 0");
    expect(GLOBALS_CSS).toContain("padding-right: max(0.375rem, var(--native-safe-right))");
  });

  it("hides Next.js dev issue badge on native", () => {
    expect(GLOBALS_CSS).toContain('html[data-native] nextjs-portal');
    expect(GLOBALS_CSS).toContain("display: none !important");
  });
});
