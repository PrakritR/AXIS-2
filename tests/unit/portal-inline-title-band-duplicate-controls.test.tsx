// @vitest-environment jsdom
//
// `ManagerPortalPageShell` renders `PortalPageTitleBand` at EVERY breakpoint once
// `hideTitleOnMobileNav` + `titleAside` are set with no `filterRow` (the `useInlineTitleBand`
// path). So a section's header controls can reach a phone by exactly one of two shapes:
//
//   a) BAND-ONLY  — an ungated `titleAside`, no `PortalPageHeaderMobileActionsRow`.
//   b) SPLIT      — a `hidden md:flex` `titleAside` paired with an `md:hidden` mobile row.
//
// Mixing them draws the controls TWICE on mobile. That shipped to production as two
// overlapping "Apply to property" buttons on resident Applications and two "Schedule a tour"
// on resident Tour — the two most important CTAs in the resident journey.
//
// The opposite failure is worse: suppressing the mobile row on a SPLIT section leaves ZERO
// controls, because its band is display:none on phones. Both halves are asserted here.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { PortalPageHeaderMobileActionsRow } from "@/components/portal/portal-section-action-row";

vi.mock("@/hooks/use-is-native-app", () => ({ useNativeChrome: () => false }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/portal/applications",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

afterEach(cleanup);

const PORTAL_DIR = join(process.cwd(), "src/components/portal");

/**
 * Sections still on the SPLIT shape (b). Their `titleAside` is `hidden md:flex`, so the band
 * contributes nothing on a phone and the mobile row is the ONLY control there — deleting it
 * would leave the section with zero controls, not one.
 */
const SPLIT_SHAPE_PANELS = [
  "manager-finances-panel.tsx",
  "manager-documents-panel.tsx",
  "resident-documents-panel.tsx",
  "resident-lease-panel.tsx",
  "resident-payments-panel.tsx",
];

/**
 * A hand-rolled mobile row is identified by its `data-slot` alone, NOT by scanning the
 * className for `md:hidden`. Panels build that className however they like — a template
 * literal with an embedded ternary (`resident-payments-panel.tsx`) contains quotes, so any
 * `[^"]*` bridge from the class list to the attribute terminates early and the panel goes
 * invisible to this sweep. The slot name is the stable marker; a row that forgot `md:hidden`
 * duplicates at every breakpoint and should be caught here too.
 */
const RENDERS_MOBILE_ROW = /<PortalPageHeaderMobileActionsRow|data-slot="[a-z-]*mobile-actions"/;

describe("header controls reach mobile exactly once", () => {
  it("every panel with a mobile actions row keeps a desktop-gated titleAside", () => {
    const offenders: string[] = [];
    for (const file of readdirSync(PORTAL_DIR)) {
      if (!file.endsWith(".tsx")) continue;
      const src = readFileSync(join(PORTAL_DIR, file), "utf8");
      if (!RENDERS_MOBILE_ROW.test(src)) continue;
      if (!src.includes("hideTitleOnMobileNav")) continue;
      // Band-only sections must not ALSO ship a mobile row; split sections must gate the band.
      if (!/hidden[^"]*\bmd:flex\b/.test(src)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("the split-shape panels still render their mobile row (never zero controls)", () => {
    for (const file of SPLIT_SHAPE_PANELS) {
      const src = readFileSync(join(PORTAL_DIR, file), "utf8");
      expect(src, `${file} lost its mobile actions row`).toMatch(RENDERS_MOBILE_ROW);
      expect(src, `${file} lost its desktop gate`).toMatch(/hidden[^"]*\bmd:flex\b/);
    }
  });

  it("a band-only shell renders the primary action once, from the band", () => {
    const applyButton = (
      <button type="button" data-attr="resident-applications-apply">
        Apply to property
      </button>
    );
    render(
      <ManagerPortalPageShell title="Applications" hideTitleOnMobileNav titleAside={applyButton} compactFilterRow>
        <p>body</p>
      </ManagerPortalPageShell>,
    );

    expect(screen.getAllByRole("button", { name: "Apply to property" })).toHaveLength(1);
    const band = document.querySelector('[data-slot="portal-page-title-band"]');
    expect(band).not.toBeNull();
    expect(band?.querySelector('[data-attr="resident-applications-apply"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="portal-page-header-mobile-actions"]')).toBeNull();
  });

  it("a shell with no titleAside still renders a mobile actions row passed as a child", () => {
    // `useInlineTitleBand` is false here, so the shell falls back to `PageHeader`, which
    // carries no actions — the mobile row is the only control and must survive.
    render(
      <ManagerPortalPageShell title="Documents" hideTitleOnMobileNav>
        <PortalPageHeaderMobileActionsRow
          actions={
            <button type="button" data-attr="documents-primary">
              Upload
            </button>
          }
        />
      </ManagerPortalPageShell>,
    );

    expect(document.querySelector('[data-slot="portal-page-header-mobile-actions"]')).not.toBeNull();
    expect(screen.getAllByRole("button", { name: "Upload" })).toHaveLength(1);
  });
});
