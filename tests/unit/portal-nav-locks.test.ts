import { describe, expect, it } from "vitest";
import {
  portalNavLockKind,
  portalNavLockNavigable,
  portalNavSectionLocked,
} from "@/lib/portals/nav-locks";

/**
 * A lock is not the same thing as a dead click.
 *
 * The resident redesign made EVERY locked nav row a non-navigating <span>, for
 * every portal kind. That silently deleted the only sidebar entry point to
 * `PortalTierPaywall`, so a free-tier manager had no way left to reach the
 * upgrade page. Locks still apply to manager free-tier sections — what changed
 * back is what clicking one does.
 */
describe("portal nav lock kinds", () => {
  describe("manager / pro free tier — locked but still sells the upgrade", () => {
    for (const kind of ["manager", "pro"] as const) {
      it(`${kind}: a paid-only section is an upsell lock`, () => {
        const params = { kind, section: "leases", subscriptionTier: "free" as const };
        expect(portalNavLockKind(params)).toBe("upsell");
        expect(portalNavSectionLocked(params)).toBe(true);
        // The click must still land on the PortalTierPaywall page.
        expect(portalNavLockNavigable(params)).toBe(true);
      });

      it(`${kind}: financials and documents are locked on Free`, () => {
        for (const section of ["financials", "documents", "services", "communication"]) {
          expect(portalNavLockKind({ kind, section, subscriptionTier: "free" })).toBe("upsell");
        }
      });

      it(`${kind}: free-tier sections are not locked at all`, () => {
        for (const section of ["dashboard", "properties", "applications", "payments", "calendar", "profile"]) {
          expect(portalNavLockKind({ kind, section, subscriptionTier: "free" })).toBe("none");
        }
      });

      it(`${kind}: nothing is locked on a paid plan`, () => {
        for (const section of ["leases", "financials", "documents", "services"]) {
          expect(portalNavLockKind({ kind, section, subscriptionTier: "paid" })).toBe("none");
          expect(portalNavLockKind({ kind, section, subscriptionTier: null })).toBe("none");
        }
      });
    }
  });

  describe("resident — locks are inert, because there is nothing to buy", () => {
    it("stage locks are inert", () => {
      const params = {
        kind: "resident" as const,
        section: "lease",
        subscriptionTier: "paid" as const,
        residentNavStage: "pre_approval" as const,
      };
      expect(portalNavLockKind(params)).toBe("inert");
      expect(portalNavSectionLocked(params)).toBe(true);
      expect(portalNavLockNavigable(params)).toBe(false);
    });

    it("keeps tour and applications locked after approval", () => {
      for (const stage of ["post_approval_pre_lease", "post_lease"] as const) {
        for (const section of ["tour", "applications"]) {
          expect(
            portalNavLockKind({ kind: "resident", section, subscriptionTier: "paid", residentNavStage: stage }),
          ).toBe("inert");
        }
      }
    });

    it("a free-tier MANAGER plan still locks the resident's section, inertly", () => {
      // The resident cannot upgrade their manager's plan, so the row is a
      // no-op — same behaviour as a stage lock, so a lock reads one way.
      const params = {
        kind: "resident" as const,
        section: "services",
        subscriptionTier: "free" as const,
        residentNavStage: "post_lease" as const,
      };
      expect(portalNavLockKind(params)).toBe("inert");
      expect(portalNavLockNavigable(params)).toBe(false);
    });

    describe("Documents on a free-tier household is NARROWED, not locked", () => {
      // The Application tab is exempt server-side because `applications` is a
      // RESIDENT_FREE_TIER_SECTION_ID. Calling the row "locked" on top of that
      // left the exemption reachable only from the approval push notification.
      const freeTierDocs = (residentNavStage: "pre_approval" | "post_approval_pre_lease" | "post_lease") => ({
        kind: "resident" as const,
        section: "documents",
        subscriptionTier: "free" as const,
        residentNavStage,
      });

      it("is a live link once the resident has an approved application", () => {
        for (const stage of ["post_approval_pre_lease", "post_lease"] as const) {
          expect(portalNavLockKind(freeTierDocs(stage))).toBe("none");
          expect(portalNavSectionLocked(freeTierDocs(stage))).toBe(false);
        }
      });

      it("stays inert before approval — there is no application to read yet", () => {
        expect(portalNavLockKind(freeTierDocs("pre_approval"))).toBe("inert");
      });

      it("does not leak to the other free-tier-locked resident sections", () => {
        // `services` is the other resident section absent from
        // RESIDENT_FREE_TIER_SECTION_IDS; it has no per-tab exemption, so it
        // stays a plain inert lock. (`move-in` and `lease` ARE free-tier
        // sections, so they were never tier-locked to begin with.)
        expect(
          portalNavLockKind({
            kind: "resident",
            section: "services",
            subscriptionTier: "free",
            residentNavStage: "post_lease",
          }),
        ).toBe("inert");
      });

      it("leaves a paid-tier household unchanged", () => {
        for (const stage of ["post_approval_pre_lease", "post_lease"] as const) {
          expect(
            portalNavLockKind({
              kind: "resident",
              section: "documents",
              subscriptionTier: "paid",
              residentNavStage: stage,
            }),
          ).toBe("none");
        }
      });

      it("is still never an upsell — it is not a lock at all", () => {
        for (const stage of ["pre_approval", "post_approval_pre_lease", "post_lease"] as const) {
          expect(portalNavLockNavigable(freeTierDocs(stage))).toBe(false);
        }
      });
    });

    it("unlocked resident sections are not locked", () => {
      for (const section of ["dashboard", "communication", "profile"]) {
        expect(
          portalNavLockKind({
            kind: "resident",
            section,
            subscriptionTier: "paid",
            residentNavStage: "pre_approval",
          }),
        ).toBe("none");
      }
    });

    it("never returns upsell for a resident, at any stage or tier", () => {
      for (const stage of ["pre_approval", "post_approval_pre_lease", "post_lease"] as const) {
        for (const tier of ["free", "paid", null] as const) {
          for (const section of ["lease", "services", "documents", "tour", "applications", "payments"]) {
            expect(
              portalNavLockKind({ kind: "resident", section, subscriptionTier: tier, residentNavStage: stage }),
            ).not.toBe("upsell");
          }
        }
      }
    });
  });

  it("locks nothing for portals with no tier or stage model", () => {
    for (const kind of ["admin", "vendor"] as const) {
      expect(portalNavLockKind({ kind, section: "financials", subscriptionTier: "free" })).toBe("none");
    }
  });
});
