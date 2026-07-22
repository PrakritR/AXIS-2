import { describe, expect, it } from "vitest";
import {
  RESIDENT_APPROVED_PORTAL_SECTIONS,
  RESIDENT_LIMITED_PORTAL_SECTIONS,
  RESIDENT_PAYMENTS_LEGACY_TABS,
  RESIDENT_PORTAL_SMOKE_PATHS,
} from "@/lib/portals/resident-sections";

/**
 * Resident Payments is Charges-only: no Charges / Summary / Statements tab
 * switcher, so the section carries no sub-nav and every legacy sub-path
 * redirects to the bare `/resident/payments` URL.
 */
describe("resident payments is charges-only", () => {
  it("declares no sub-tabs in either resident section registry", () => {
    for (const sections of [RESIDENT_LIMITED_PORTAL_SECTIONS, RESIDENT_APPROVED_PORTAL_SECTIONS]) {
      const payments = sections.find((s) => s.section === "payments");
      expect(payments).toBeDefined();
      expect(payments!.tabs).toEqual([]);
    }
  });

  it("links the sidebar/smoke path at the bare payments URL", () => {
    const payments = RESIDENT_PORTAL_SMOKE_PATHS.find((p) => p.label === "Payments");
    expect(payments?.path).toBe("/resident/payments");
  });

  it("maps every legacy payments sub-path, preserving only the status pills", () => {
    expect(RESIDENT_PAYMENTS_LEGACY_TABS.pending).toEqual({ status: "pending" });
    expect(RESIDENT_PAYMENTS_LEGACY_TABS.overdue).toEqual({ status: "overdue" });
    expect(RESIDENT_PAYMENTS_LEGACY_TABS.paid).toEqual({ status: "paid" });
    // The removed tabs land on Charges with no status filter.
    for (const tab of ["charges", "summary", "statements", "balance"]) {
      expect(RESIDENT_PAYMENTS_LEGACY_TABS[tab]).toEqual({});
    }
  });

  it("does not treat Object.prototype members as known legacy sub-paths", () => {
    // A plain object literal would resolve these and soft-redirect
    // `/resident/payments/toString` instead of 404ing.
    for (const key of ["toString", "constructor", "valueOf", "hasOwnProperty", "__proto__"]) {
      expect(RESIDENT_PAYMENTS_LEGACY_TABS[key]).toBeUndefined();
    }
    expect(RESIDENT_PAYMENTS_LEGACY_TABS.bogus).toBeUndefined();
  });
});
