import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PORTAL_METRICS_SOURCE = readFileSync(
  join(process.cwd(), "src/components/portal/portal-metrics.tsx"),
  "utf8",
);

const GLOBALS_CSS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

describe("portal mobile shell conventions", () => {
  it("keeps ManagerPortalPageShell header compact on narrow screens", () => {
    expect(PORTAL_METRICS_SOURCE).toContain("flex-wrap items-center justify-between");
    expect(PORTAL_METRICS_SOURCE).toContain("hideTitleOnNative = false");
  });

  it("wraps status pills on mobile instead of scrolling horizontally by default", () => {
    expect(PORTAL_METRICS_SOURCE).toContain("inline-flex max-w-full flex-wrap items-center gap-1 rounded-2xl");
    expect(PORTAL_METRICS_SOURCE).toContain('compact = false');
  });

  it("allows horizontal scroll only for compact status pill strips", () => {
    expect(PORTAL_METRICS_SOURCE).toContain("flex-nowrap");
    expect(PORTAL_METRICS_SOURCE).toContain("overflow-x-auto");
  });

  it("scopes nested scroll panels to desktop only", () => {
    expect(GLOBALS_CSS).toContain(".portal-desktop-scroll-panel");
    expect(GLOBALS_CSS).toContain("@media (min-width: 1024px)");
  });

  it("uses measured bottom nav inset on native main content", () => {
    expect(GLOBALS_CSS).toContain("padding-bottom: var(--portal-native-bottom-nav-inset)");
    expect(GLOBALS_CSS).toContain("scroll-padding-bottom: var(--portal-native-bottom-nav-inset)");
  });

  it("documents native dashboard preview list spacing", () => {
    expect(GLOBALS_CSS).toContain("html[data-native] .portal-preview-list");
    expect(PORTAL_METRICS_SOURCE).toContain("PORTAL_DASHBOARD_STACK");
    expect(PORTAL_METRICS_SOURCE).toContain("PortalDashboardPreviewList");
  });

  it("uses native safe-area top padding on portal main content", () => {
    expect(GLOBALS_CSS).toContain("html[data-native] #portal-main-content");
    expect(GLOBALS_CSS).toContain("padding-top: max(0.25rem, var(--native-safe-top))");
    expect(GLOBALS_CSS).toContain("scroll-padding-top: max(0.25rem, var(--native-safe-top))");
    expect(GLOBALS_CSS).toContain("html[data-native] #portal-main-content:has(.portal-mobile-nav-bar)");
    expect(GLOBALS_CSS).toContain("html[data-native] .portal-mobile-nav-bar");
    expect(GLOBALS_CSS).toContain("min-height: calc(var(--native-safe-top) + 1.5rem)");
  });

  it("pins native bottom nav flush to screen bottom", () => {
    expect(GLOBALS_CSS).toContain("html[data-native] .portal-native-bottom-nav");
    expect(GLOBALS_CSS).toContain("bottom: 0");
    expect(GLOBALS_CSS).toContain("padding-right: max(0.5rem, var(--native-safe-right))");
  });

  it("evenly distributes Instagram-style bottom tabs instead of scrolling", () => {
    expect(GLOBALS_CSS).toContain("html[data-native] .portal-native-bottom-nav-scroll");
    expect(GLOBALS_CSS).toContain("justify-content: space-evenly");
    expect(GLOBALS_CSS).toContain("html[data-native] .portal-native-bottom-nav-scroll > a");
    expect(GLOBALS_CSS).toContain("flex: 1 1 0;");
  });

  it("sizes native bottom tab icons consistently", () => {
    expect(GLOBALS_CSS).toContain("html[data-native] .portal-native-bottom-nav-scroll a svg");
    expect(GLOBALS_CSS).toContain("height: 1.4375rem");
  });

  it("floats the assistant FAB above the native bottom bar instead of a bar slot", () => {
    const AXIS_ASSISTANT_SOURCE = readFileSync(
      join(process.cwd(), "src/components/portal/axis-assistant.tsx"),
      "utf8",
    );
    expect(AXIS_ASSISTANT_SOURCE).not.toContain("AxisAssistantNavButton");
    expect(AXIS_ASSISTANT_SOURCE).toContain("[html[data-native]_&]:bottom-[calc(var(--portal-native-bottom-nav-inset)+0.75rem)]");
    expect(GLOBALS_CSS).not.toContain(".axis-assistant-nav-btn");
    expect(GLOBALS_CSS).not.toContain(".portal-native-bottom-nav-assistant");
  });

  it("hides Next.js dev issue badge on native", () => {
    expect(GLOBALS_CSS).toContain('html[data-native] nextjs-portal');
    expect(GLOBALS_CSS).toContain("display: none !important");
  });
});
