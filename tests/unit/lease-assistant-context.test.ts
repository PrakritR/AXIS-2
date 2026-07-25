import { describe, expect, it } from "vitest";
import { buildLeaseModalAssistantContext } from "@/lib/lease-assistant-context";
import { isLeaseAssistantContext } from "@/lib/agent/assistant-turn-context";

describe("buildLeaseModalAssistantContext", () => {
  it("includes propertyId and current lease source", () => {
    const ctx = buildLeaseModalAssistantContext({
      propertyId: "mgr-oak-1",
      propertyLabel: "Oak House",
      currentSource: "axis_default",
    });
    expect(ctx).toContain("propertyId=mgr-oak-1");
    expect(ctx).toContain("property=Oak House");
    expect(ctx).toContain("update_property_lease_config");
  });

  it("flags bulk edits for single-property tool calls", () => {
    const ctx = buildLeaseModalAssistantContext({
      propertyIds: ["a", "b"],
      currentSource: "custom_comments",
    });
    expect(ctx).toContain("propertyIds=a,b");
    expect(ctx).toContain("single property");
  });
});

describe("isLeaseAssistantContext", () => {
  it("detects lease modal hints", () => {
    expect(isLeaseAssistantContext("Lease modal · propertyId=p1")).toBe(true);
    expect(isLeaseAssistantContext("New promotion (flyer)")).toBe(false);
  });
});
