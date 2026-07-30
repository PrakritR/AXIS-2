import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  RESIDENT_APPLICATION_PHASE_PORTAL_SECTIONS,
  RESIDENT_APPROVED_PORTAL_SECTIONS,
  RESIDENT_LIMITED_PORTAL_SECTIONS,
} from "@/lib/portals/resident-sections";
import { isResidentApplicationPhaseAllowedPath } from "@/lib/resident-portal-route-guard";

const ROOT = join(process.cwd(), "src/components/portal");

function readPanel(filename: string): string {
  return readFileSync(join(ROOT, filename), "utf8");
}

function sectionIds(sections: { section: string }[]): string[] {
  return sections.map((s) => s.section);
}

describe("resident portal redesign completeness", () => {
  describe("three access-state section catalogs", () => {
    it("application phase exposes only Application + Settings", () => {
      expect(sectionIds(RESIDENT_APPLICATION_PHASE_PORTAL_SECTIONS)).toEqual(["applications", "profile"]);
    });

    it("limited workspace includes dashboard and omits services", () => {
      const ids = sectionIds(RESIDENT_LIMITED_PORTAL_SECTIONS);
      expect(ids).toContain("dashboard");
      expect(ids).not.toContain("services");
      expect(ids).toContain("communication");
    });

    it("approved workspace adds services to the limited set", () => {
      const limited = new Set(sectionIds(RESIDENT_LIMITED_PORTAL_SECTIONS));
      const approved = sectionIds(RESIDENT_APPROVED_PORTAL_SECTIONS);
      for (const id of limited) {
        expect(approved).toContain(id);
      }
      expect(approved).toContain("services");
    });

    it("application-phase route guard blocks dashboard unless submission completed", () => {
      expect(isResidentApplicationPhaseAllowedPath("/resident/dashboard")).toBe(false);
      expect(isResidentApplicationPhaseAllowedPath("/resident/dashboard", { allowDashboard: true })).toBe(true);
      expect(isResidentApplicationPhaseAllowedPath("/resident/profile")).toBe(true);
      expect(isResidentApplicationPhaseAllowedPath("/resident/lease")).toBe(false);
    });
  });

  describe("no navigation/sort/filter dropdowns in production resident panels", () => {
    const productionPanels = [
      "resident-dashboard.tsx",
      "resident-applications-panel.tsx",
      "resident-lease-panel.tsx",
      "resident-payments-panel.tsx",
      "resident-move-in-panel.tsx",
      "resident-move-in-view.tsx",
      "resident-services-panel.tsx",
      "resident-communication.tsx",
      "resident-documents-panel.tsx",
      "resident-profile-panel.tsx",
    ];

    it.each(productionPanels)("%s does not use TabNav or FilterBar for navigation", (file) => {
      const src = readPanel(file);
      expect(src).not.toMatch(/\bTabNav\b/);
      expect(src).not.toMatch(/\bFilterBar\b/);
      expect(src).not.toMatch(/\bDropdownMenu\b/);
    });

    it("services uses LocalDestinationNav for status filters, not mobile dropdowns", () => {
      const src = readPanel("resident-services-panel.tsx");
      expect(src).toContain("LocalDestinationNav");
      expect(src).not.toMatch(/\bPillTabs\b/);
      expect(src).not.toMatch(/Filter & sort/);
    });

    it("hideTitleOnMobileNav keeps section actions off the mobile PageHeader row", () => {
      const src = readFileSync(
        join(process.cwd(), "src/components/portal/portal-metrics.tsx"),
        "utf8",
      );
      expect(src).toMatch(/useInlineTitleBand[\s\S]*hideTitleOnMobileNav/);
      expect(src).toMatch(
        /titleAsideDesktopOnly[\s\S]*Boolean\(titleAside && hideTitleOnMobileNav && !useInlineTitleBand\)/,
      );
      expect(src).toMatch(/primaryAction=\{titleAside && !titleAsideDesktopOnly/);
      expect(src).toContain("showMobileFooterActions = titleAsideDesktopOnly");
    });

    it("legacy inbox panel folder tabs are not mounted from resident-communication", () => {
      const src = readPanel("resident-communication.tsx");
      expect(src).toContain("ResidentUnifiedInbox");
      expect(src).not.toMatch(/\bTabNav\b/);
    });
  });

  describe("three-band header contract on list sections", () => {
    const band2Panels: Array<{ file: string; marker: string }> = [
      { file: "resident-applications-panel.tsx", marker: "PortalListControlStack" },
      { file: "resident-lease-panel.tsx", marker: "PortalListControlStack" },
      { file: "resident-payments-panel.tsx", marker: "PortalListControlStack" },
      { file: "resident-move-in-view.tsx", marker: "PortalListControlStack" },
      { file: "resident-services-panel.tsx", marker: "PortalListControlStack" },
      { file: "resident-documents-panel.tsx", marker: "PortalListControlStack" },
    ];

    it.each(band2Panels)("%s uses %s for band-2 tabs", ({ file, marker }) => {
      expect(readPanel(file)).toContain(marker);
    });

    it("list sections hide duplicate mobile titles on page shells", () => {
      const shellPanels = [
        "resident-applications-panel.tsx",
        "resident-lease-panel.tsx",
        "resident-payments-panel.tsx",
        "resident-services-panel.tsx",
        "resident-documents-panel.tsx",
        "resident-dashboard.tsx",
        "resident-profile-panel.tsx",
        "resident-move-in-panel.tsx",
      ];
      for (const file of shellPanels) {
        expect(readPanel(file)).toContain("hideTitleOnMobileNav");
      }
    });

    it("communication uses PortalCommunicationShell + PortalSectionActionRow", () => {
      const src = readPanel("resident-communication.tsx");
      expect(src).toContain("PortalCommunicationShell");
      expect(src).toContain("PortalSectionActionRow");
    });

    it("dashboard uses manager-style attention groups without welcome subtitle", () => {
      const src = readPanel("resident-dashboard.tsx");
      expect(src).toContain("AttentionGroup");
      expect(src).toContain("Needs attention");
      expect(src).not.toMatch(/subtitle=\{?["'].*[Ww]elcome/);
      expect(src).toContain("hideTitleOnMobileNav");
    });

    it("dashboard openCount respects customize visibility", () => {
      const src = readPanel("resident-dashboard.tsx");
      expect(src).toMatch(/visibility\.payments \? pendingCharges\.length : 0/);
      expect(src).toMatch(/visibility\.services && canUseFullPortal/);
      expect(src).toMatch(/visibility\.communication \? inboxThreads\.length : 0/);
    });
  });

  describe("390px mobile density sweep", () => {
    it("unlock and tier gates use compact inline notices, not glass cards", () => {
      const unlockSurfaces = [
        readPanel("resident-payments-panel.tsx"),
        readPanel("resident-services-panel.tsx"),
        readPanel("resident-move-in-view.tsx"),
        readFileSync(join(process.cwd(), "src/lib/render-portal-section.tsx"), "utf8"),
      ];
      for (const src of unlockSurfaces) {
        expect(src).toContain("PORTAL_INLINE_UNLOCK_NOTICE_CLASS");
        expect(src).not.toMatch(/glass-card.*unlock/i);
      }
      expect(readPanel("resident-payments-panel.tsx")).not.toContain("glass-card");
      expect(readPanel("resident-lease-panel.tsx")).not.toContain("glass-card");
    });

    it("status filter rows span full width on lease and services", () => {
      expect(readPanel("resident-lease-panel.tsx")).toMatch(/LocalDestinationNav[\s\S]*className="w-full"/);
      const services = readPanel("resident-services-panel.tsx");
      expect(services.match(/className="w-full"/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    });

    it("stranded header actions are duplicated in mobile action rows", () => {
      const services = readPanel("resident-services-panel.tsx");
      expect(services).toContain("resident-services-mobile-actions");
      expect(services).toMatch(/\[&_button\]:w-full/);
      const lease = readPanel("resident-lease-panel.tsx");
      expect(lease).toMatch(/leaseMobileActionsRow|md:hidden/);
    });

    it("application phase dashboard is route-guarded; limited omits services; approved adds it", () => {
      expect(sectionIds(RESIDENT_APPLICATION_PHASE_PORTAL_SECTIONS)).not.toContain("dashboard");
      expect(sectionIds(RESIDENT_LIMITED_PORTAL_SECTIONS)).toContain("dashboard");
      expect(sectionIds(RESIDENT_LIMITED_PORTAL_SECTIONS)).not.toContain("services");
      expect(sectionIds(RESIDENT_APPROVED_PORTAL_SECTIONS)).toContain("services");
      expect(sectionIds(RESIDENT_APPROVED_PORTAL_SECTIONS)).toContain("dashboard");
    });
  });
});
