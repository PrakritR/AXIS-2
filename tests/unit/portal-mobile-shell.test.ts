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
    expect(GLOBALS_CSS).toContain("html[data-native] .portal-native-bottom-nav-scroll");
    // Grid row — tabs share width evenly without horizontal scroll.
    expect(GLOBALS_CSS).toContain("display: grid");
    expect(GLOBALS_CSS).toContain("html[data-native] .portal-native-bottom-nav-scroll > a");
    expect(GLOBALS_CSS).toContain("html[data-native] .portal-native-bottom-nav-scroll > button");
    expect(GLOBALS_CSS).toContain("min-width: 0");
  });

  it("sizes native bottom tab icons consistently", () => {
    expect(GLOBALS_CSS).toContain("html[data-native] .portal-native-bottom-nav-scroll a svg");
    expect(GLOBALS_CSS).toContain("height: 1.375rem");
    expect(GLOBALS_CSS).toContain("width: 1.375rem");
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

  it("leaves fixed-chrome page shells free to flex on phones", () => {
    // `.portal-main-inner > * { flex: 0 0 auto }` is unlayered, so it beats the
    // Tailwind `flex-1` utility on the page shell. Unscoped, it pinned the shell
    // to its full content height inside the `overflow: hidden`
    // #portal-main-content of every sticky-chrome / Communication surface, so
    // .portal-list-page-scroll never got a bounded height and phone pages taller
    // than the viewport could not scroll below the fold.
    expect(GLOBALS_CSS).toContain(
      "html:not([data-portal-sticky-chrome]):not([data-communication-surface]) .portal-main-inner > *",
    );
    expect(GLOBALS_CSS).not.toMatch(/\n {2}\.portal-main-inner > \* \{\n {4}flex: 0 0 auto;/);
  });

  it("drops the duplicate Settings page title behind the mobile app bar", () => {
    const PROFILE_SOURCE = readFileSync(
      join(process.cwd(), "src/components/portal/portal-profile-client.tsx"),
      "utf8",
    );
    expect(PROFILE_SOURCE).toContain("hideTitleOnMobileNav");
  });
});
