import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PORTAL_METRICS_SOURCE = readFileSync(
  join(process.cwd(), "src/components/portal/portal-metrics.tsx"),
  "utf8",
);

const GLOBALS_CSS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

const PORTAL_SIDEBAR_SOURCE = readFileSync(
  join(process.cwd(), "src/components/portal/portal-sidebar.tsx"),
  "utf8",
);

describe("portal mobile shell conventions", () => {
  it("keeps ManagerPortalPageShell header compact on narrow screens", () => {
    expect(PORTAL_METRICS_SOURCE).toContain("PageHeader");
    expect(PORTAL_METRICS_SOURCE).toContain("hideTitleOnNative = false");
    expect(PORTAL_METRICS_SOURCE).toContain("hideTitleOnMobileNav = false");
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
    expect(GLOBALS_CSS).toContain("--portal-mobile-scroll-bottom-inset");
    expect(GLOBALS_CSS).toContain("padding-bottom: var(--portal-mobile-scroll-bottom-inset)");
    expect(GLOBALS_CSS).toContain("scroll-padding-bottom: var(--portal-mobile-scroll-bottom-inset)");
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
    // The bar is a GRID of equal columns, not flexbox `space-evenly` + `flex: 1 1 0`.
    // The column count is the tab count, so every tab gets exactly the same width and the
    // strip can never scroll. Assert that shape rather than the properties it replaced.
    expect(GLOBALS_CSS).toContain("html[data-native] .portal-native-bottom-nav-scroll");
    expect(GLOBALS_CSS).toContain("display: grid");
    expect(GLOBALS_CSS).toContain("html[data-native] .portal-native-bottom-nav-scroll > a");
    expect(PORTAL_SIDEBAR_SOURCE).toContain("portal-native-bottom-nav-scroll");
    expect(PORTAL_SIDEBAR_SOURCE).toMatch(/gridTemplateColumns:\s*`repeat\(\$\{[^}]+\},\s*minmax\(0,\s*1fr\)\)`/);
  });

  it("sizes native bottom tab icons consistently", () => {
    expect(GLOBALS_CSS).toContain("html[data-native] .portal-native-bottom-nav-scroll a svg");
    // One size for both the anchor and button tabs; the exact value is a design choice, so
    // assert they MATCH rather than pinning a number that moves with the design.
    const iconRule = GLOBALS_CSS.match(
      /html\[data-native\] \.portal-native-bottom-nav-scroll a svg,\s*html\[data-native\] \.portal-native-bottom-nav-scroll button svg \{([^}]*)\}/,
    );
    expect(iconRule).not.toBeNull();
    const height = iconRule![1]!.match(/height:\s*([\d.]+rem)/)?.[1];
    const width = iconRule![1]!.match(/width:\s*([\d.]+rem)/)?.[1];
    expect(height).toBeDefined();
    expect(width).toBe(height);
  });

  it("floats the assistant FAB above the native bottom bar instead of a bar slot", () => {
    const AXIS_ASSISTANT_SOURCE = readFileSync(
      join(process.cwd(), "src/components/portal/axis-assistant.tsx"),
      "utf8",
    );
    expect(AXIS_ASSISTANT_SOURCE).not.toContain("AxisAssistantNavButton");
    expect(AXIS_ASSISTANT_SOURCE).toContain("[html[data-native]_&]:bottom-[calc(var(--portal-native-bottom-nav-inset)+0.75rem)]");
    expect(GLOBALS_CSS).toContain(".axis-assistant-fab");
    expect(GLOBALS_CSS).toContain("calc(var(--portal-native-bottom-nav-inset, 0px) + 0.75rem)");
    expect(GLOBALS_CSS).not.toContain(".axis-assistant-nav-btn");
    expect(GLOBALS_CSS).not.toContain(".portal-native-bottom-nav-assistant");
  });

  it("hides Next.js dev issue badge on native", () => {
    expect(GLOBALS_CSS).toContain('html[data-native] nextjs-portal');
    expect(GLOBALS_CSS).toContain("display: none !important");
  });
});
