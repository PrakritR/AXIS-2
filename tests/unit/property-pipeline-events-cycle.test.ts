import { describe, expect, it } from "vitest";

/**
 * Regression guard for the portal-wide 500 caused by a circular-import TDZ:
 * `manager-portfolio-access.ts` reads `PROPERTY_PIPELINE_EVENT` at MODULE-EVAL
 * time (building `MANAGER_PORTFOLIO_REFRESH_EVENTS`), and the import cycle
 *   demo-property-pipeline → persisted-property-records
 *     → demo-admin-property-inventory → manager-portfolio-access
 *     → demo-property-pipeline
 * meant the const could be accessed before its initializer ran
 * ("Cannot access 'PROPERTY_PIPELINE_EVENT' before initialization").
 *
 * The fix moves the constant into the cycle-free leaf module
 * `@/lib/property-pipeline-events`. Importing the modules in the
 * cycle-triggering order (pipeline first) must not throw, and the refresh-event
 * array must still carry the shared event value.
 *
 * NOTE: bundler (Turbopack) module-eval order differs from vitest's loader, so
 * the definitive guard for the runtime crash is the production build / dev-boot
 * check in CI; this test pins the wiring and the shared constant value.
 */
describe("property-pipeline event constant is cycle-free", () => {
  it("imports the cyclic modules without a TDZ and shares one event value", async () => {
    // Import in the order that starts the real bundle's cycle.
    const pipeline = await import("@/lib/demo-property-pipeline");
    const leaf = await import("@/lib/property-pipeline-events");
    const portfolio = await import("@/lib/manager-portfolio-access");

    expect(leaf.PROPERTY_PIPELINE_EVENT).toBe("axis-property-pipeline");
    // demo-property-pipeline must re-export the same value it used to own.
    expect(pipeline.PROPERTY_PIPELINE_EVENT).toBe(leaf.PROPERTY_PIPELINE_EVENT);
    // The refresh-event array evaluated at module load without hitting the TDZ.
    expect(portfolio.MANAGER_PORTFOLIO_REFRESH_EVENTS).toContain(leaf.PROPERTY_PIPELINE_EVENT);
  });
});
