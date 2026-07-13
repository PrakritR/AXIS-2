import { describe, expect, it } from "vitest";
import {
  evaluateDispatchGuardrails,
  guardrailsAllowAutoDispatch,
  isEmergencyWorkOrder,
} from "@/lib/work-order-dispatch";
import { normalizeVendorDispatchSettings } from "@/lib/vendor-dispatch-settings";

const settings = (overrides: Record<string, unknown> = {}) =>
  normalizeVendorDispatchSettings({ mode: "auto", ...overrides });

const workOrder = (overrides: Record<string, unknown> = {}) =>
  ({ category: "plumbing", vendorCostCents: undefined, cost: undefined, ...overrides }) as never;

describe("evaluateDispatchGuardrails", () => {
  it("passes everything with no filters and no estimate", () => {
    const g = evaluateDispatchGuardrails(settings(), workOrder(), { vendorId: "v1" });
    expect(g).toEqual({ approvedList: true, category: true, spendCap: "no_estimate" });
    expect(guardrailsAllowAutoDispatch(g)).toBe(true);
  });

  it("fails the approved list for an unlisted vendor and an explicitly empty list", () => {
    const unlisted = evaluateDispatchGuardrails(settings({ approvedVendorIds: ["v2"] }), workOrder(), {
      vendorId: "v1",
    });
    expect(unlisted.approvedList).toBe(false);
    expect(guardrailsAllowAutoDispatch(unlisted)).toBe(false);

    const nobody = evaluateDispatchGuardrails(settings({ approvedVendorIds: [] }), workOrder(), {
      vendorId: "v1",
    });
    expect(nobody.approvedList).toBe(false);
  });

  it("fails category when the work order category is excluded or missing", () => {
    const excluded = evaluateDispatchGuardrails(settings({ categories: ["hvac"] }), workOrder(), {
      vendorId: "v1",
    });
    expect(excluded.category).toBe(false);

    const missing = evaluateDispatchGuardrails(
      settings({ categories: ["plumbing"] }),
      workOrder({ category: undefined }),
      { vendorId: "v1" },
    );
    expect(missing.category).toBe(false);
  });

  it("evaluates the spend cap from vendorCostCents, then the cost string", () => {
    const under = evaluateDispatchGuardrails(
      settings({ spendCapCents: 50000 }),
      workOrder({ vendorCostCents: 40000 }),
      { vendorId: "v1" },
    );
    expect(under.spendCap).toBe("pass");

    const over = evaluateDispatchGuardrails(
      settings({ spendCapCents: 50000 }),
      workOrder({ vendorCostCents: 60000 }),
      { vendorId: "v1" },
    );
    expect(over.spendCap).toBe("over_cap");
    expect(guardrailsAllowAutoDispatch(over)).toBe(false);

    const fromCostString = evaluateDispatchGuardrails(
      settings({ spendCapCents: 50000 }),
      workOrder({ cost: "$620.50" }),
      { vendorId: "v1" },
    );
    expect(fromCostString.spendCap).toBe("over_cap");
  });

  it("treats no estimate as pass-through for auto mode (cap is advisory pre-bid)", () => {
    const g = evaluateDispatchGuardrails(settings({ spendCapCents: 100 }), workOrder(), {
      vendorId: "v1",
    });
    expect(g.spendCap).toBe("no_estimate");
    expect(guardrailsAllowAutoDispatch(g)).toBe(true);
  });
});

describe("isEmergencyWorkOrder", () => {
  const row = (over: Record<string, unknown>) =>
    ({ priority: "Medium", title: "", description: "", category: "general", ...over }) as never;

  it("flags the Emergency priority regardless of category", () => {
    expect(isEmergencyWorkOrder(row({ priority: "Emergency" }))).toBe(true);
    expect(isEmergencyWorkOrder(row({ priority: "urgent" }))).toBe(true);
  });

  it("flags water/gas/power keywords only for plumbing, hvac, and electrical", () => {
    expect(isEmergencyWorkOrder(row({ category: "plumbing", title: "Burst pipe flooding kitchen" }))).toBe(true);
    expect(isEmergencyWorkOrder(row({ category: "hvac", description: "smell of gas near furnace" }))).toBe(true);
    expect(isEmergencyWorkOrder(row({ category: "electrical", description: "outlet sparking" }))).toBe(true);
    expect(isEmergencyWorkOrder(row({ category: "general", title: "flooding" }))).toBe(false);
  });

  it("stays quiet for routine work", () => {
    expect(isEmergencyWorkOrder(row({ category: "plumbing", title: "Slow drain" }))).toBe(false);
    expect(isEmergencyWorkOrder(row({ priority: "High", title: "Broken cabinet" }))).toBe(false);
  });
});
