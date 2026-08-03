// @vitest-environment jsdom
//
// `ManagerPortalPageShell` renders `PortalPageTitleBand` at EVERY breakpoint once
// `hideTitleOnMobileNav` + `titleAside` are set with no `filterRow` (the
// `useInlineTitleBand` path). A `PortalPageHeaderMobileActionsRow` rendered as a child of
// one therefore draws the SAME filter + primary actions a second time on phones.
//
// That is not hypothetical: it shipped to production as two overlapping "Apply to property"
// buttons on resident Applications and two "Schedule a tour" on resident Tour — the two most
// important CTAs in the resident journey.
//
// The guard is `PortalInlineTitleBandContext`, so a section can no longer reintroduce the
// duplicate by passing a mobile actions row the title band already covers. These tests drive
// the real shell, and they check BOTH halves: never two, and never zero.
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

const applyButton = (
  <button type="button" data-attr="resident-applications-apply">
    Apply to property
  </button>
);

describe("inline title band vs mobile actions row", () => {
  it("renders the primary action exactly once when a section passes both", () => {
    render(
      <ManagerPortalPageShell title="Applications" hideTitleOnMobileNav titleAside={applyButton} compactFilterRow>
        <PortalPageHeaderMobileActionsRow actions={applyButton} />
        <p>body</p>
      </ManagerPortalPageShell>,
    );

    // The band supplies it; the mobile row is suppressed. Two would be the production bug.
    expect(screen.getAllByRole("button", { name: "Apply to property" })).toHaveLength(1);
    expect(document.querySelector('[data-slot="portal-page-title-band"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="portal-page-header-mobile-actions"]')).toBeNull();
  });

  it("never suppresses it to zero — the band is what still carries the action", () => {
    render(
      <ManagerPortalPageShell title="Tour" hideTitleOnMobileNav titleAside={applyButton} compactFilterRow>
        <PortalPageHeaderMobileActionsRow actions={applyButton} />
      </ManagerPortalPageShell>,
    );

    const band = document.querySelector('[data-slot="portal-page-title-band"]');
    expect(band).not.toBeNull();
    expect(band?.querySelector('[data-attr="resident-applications-apply"]')).not.toBeNull();
  });

  it("still renders a mobile actions row when the shell is NOT using the inline band", () => {
    // No `titleAside` => `useInlineTitleBand` is false => the shell falls back to `PageHeader`,
    // which carries no actions. The mobile row is the only control there and must survive.
    render(
      <ManagerPortalPageShell title="Documents" hideTitleOnMobileNav>
        <PortalPageHeaderMobileActionsRow actions={applyButton} />
      </ManagerPortalPageShell>,
    );

    expect(document.querySelector('[data-slot="portal-page-header-mobile-actions"]')).not.toBeNull();
    expect(screen.getAllByRole("button", { name: "Apply to property" })).toHaveLength(1);
  });

  it("a filterRow shell keeps its mobile row — filterRow opts out of the inline band", () => {
    render(
      <ManagerPortalPageShell
        title="Payments"
        hideTitleOnMobileNav
        titleAside={applyButton}
        filterRow={<div>filters</div>}
      >
        <PortalPageHeaderMobileActionsRow actions={applyButton} />
      </ManagerPortalPageShell>,
    );

    expect(document.querySelector('[data-slot="portal-page-header-mobile-actions"]')).not.toBeNull();
  });
});
