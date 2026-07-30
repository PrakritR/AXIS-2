import { describe, expect, it } from "vitest";
import {
  defaultResidentDashboardVisibility,
  RESIDENT_DASHBOARD_SECTIONS,
} from "@/lib/resident-dashboard-preferences";

describe("resident dashboard preferences", () => {
  it("defines five customizable attention groups", () => {
    expect(RESIDENT_DASHBOARD_SECTIONS.map((s) => s.id)).toEqual([
      "payments",
      "lease",
      "applications",
      "services",
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
