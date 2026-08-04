// The portal-entry plan chooser (/auth/manager/choose-plan) must never re-ask a
// manager who already holds a plan. It is only routed-to from the get-started
// provisioning step, and this predicate is the belt-and-braces guard for direct
// visits: anything already settled forwards straight to the portal.
import { describe, expect, it } from "vitest";
import { managerEntryPlanAlreadySettled } from "@/components/auth/manager-entry-plan-chooser";

describe("managerEntryPlanAlreadySettled", () => {
  it("treats the fresh signup trial as NOT settled — that's the cohort the chooser exists for", () => {
    expect(managerEntryPlanAlreadySettled({ tier: "pro", billing: "trial" })).toBe(false);
  });

  it("treats a legacy account with no committed tier as not settled", () => {
    expect(managerEntryPlanAlreadySettled({ tier: null, billing: null })).toBe(false);
  });

  it("never re-asks a committed Free account", () => {
    expect(managerEntryPlanAlreadySettled({ tier: "free", billing: "free" })).toBe(true);
    expect(managerEntryPlanAlreadySettled({ tier: "free", billing: "monthly" })).toBe(true);
  });

  it("never re-asks an account with an active Stripe or Apple subscription", () => {
    expect(managerEntryPlanAlreadySettled({ tier: "pro", billing: "monthly", stripeManaged: true })).toBe(true);
    expect(managerEntryPlanAlreadySettled({ tier: "business", billing: "apple", appleManaged: true })).toBe(true);
  });

  it("never re-asks a waiver/admin-granted paid tier (paid, but not on the signup trial)", () => {
    expect(managerEntryPlanAlreadySettled({ tier: "business", billing: "monthly" })).toBe(true);
    expect(managerEntryPlanAlreadySettled({ tier: "pro", billing: "admin" })).toBe(true);
  });

  it("fails closed when the plan could not be read — an unknown plan is never re-asked", () => {
    // `GET /api/manager/subscription` reports a failed purchase-row read as
    // `planUnknown: true` with every other field nulled, which is byte-identical
    // to a fresh trial account. Showing the chooser there would let "Continue
    // with Free" rewrite a paying manager's row to tier=free.
    expect(
      managerEntryPlanAlreadySettled({
        tier: null,
        billing: null,
        stripeManaged: false,
        appleManaged: false,
        planUnknown: true,
      }),
    ).toBe(true);
    expect(managerEntryPlanAlreadySettled({ tier: "pro", billing: "trial", planUnknown: true })).toBe(true);
  });
});
