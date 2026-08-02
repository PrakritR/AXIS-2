import { describe, expect, it } from "vitest";
import {
  defaultResidentDashboardVisibility,
  RESIDENT_DASHBOARD_SECTIONS,
} from "@/lib/resident-dashboard-preferences";

describe("resident dashboard preferences", () => {
  it("defines six customizable attention groups", () => {
    // houseDetails joined the catalog with the resident house-details group. Its render is
    // gated on visibility.houseDetails in resident-dashboard.tsx, which is the invariant that
    // matters: a section missing from this catalog bypasses the Customize modal entirely.
    expect(RESIDENT_DASHBOARD_SECTIONS.map((s) => s.id)).toEqual([
      "payments",
      "lease",
      "applications",
      "services",
      "houseDetails",
      "communication",
    ]);
  });

  it("defaults every section to visible", () => {
    const visibility = defaultResidentDashboardVisibility();
    for (const section of RESIDENT_DASHBOARD_SECTIONS) {
      expect(visibility[section.id]).toBe(true);
    }
  });
});
