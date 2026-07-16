import { describe, expect, it } from "vitest";
import {
  filingPropertyPriority,
  pickPrimaryFilingScope,
} from "@/lib/resident-filing-scope";

describe("filingPropertyPriority", () => {
  it("ranks canonical demo portfolio ahead of guided mirrors", () => {
    expect(filingPropertyPriority("mgr-demo-pioneer")).toBeLessThan(
      filingPropertyPriority("mgr-te-demo-pioneer"),
    );
    expect(filingPropertyPriority("mgr-demo-pioneer")).toBeLessThan(
      filingPropertyPriority("mgr-live-lakeview"),
    );
  });
});

describe("pickPrimaryFilingScope", () => {
  const demo = {
    managerUserId: "b5809cf3-demo",
    propertyId: "mgr-demo-pioneer",
    approved: true,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const guided = {
    managerUserId: "6ccc2e9b-guided",
    propertyId: "mgr-te-demo-pioneer",
    approved: true,
    updatedAt: "2026-07-01T00:00:00.000Z",
  };

  it("prefers mgr-demo over mgr-te-demo even when guided is newer and claimed", () => {
    const chosen = pickPrimaryFilingScope([guided, demo], {
      managerUserId: guided.managerUserId,
      propertyId: guided.propertyId,
    });
    expect(chosen?.managerUserId).toBe(demo.managerUserId);
    expect(chosen?.propertyId).toBe(demo.propertyId);
  });

  it("honors a claim within the same priority tier", () => {
    const otherDemo = {
      managerUserId: "aaaaaaaa-aaaa",
      propertyId: "mgr-demo-emerald",
      approved: true,
      updatedAt: "2026-02-01T00:00:00.000Z",
    };
    const chosen = pickPrimaryFilingScope([demo, otherDemo], {
      managerUserId: otherDemo.managerUserId,
      propertyId: otherDemo.propertyId,
    });
    expect(chosen?.propertyId).toBe("mgr-demo-emerald");
  });

  it("prefers approved over pending when no demo-tier properties exist", () => {
    const pending = {
      managerUserId: "pending-mgr",
      propertyId: "spruce-1",
      approved: false,
      updatedAt: "2026-07-10T00:00:00.000Z",
    };
    const approved = {
      managerUserId: "approved-mgr",
      propertyId: "lakeview-1",
      approved: true,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const chosen = pickPrimaryFilingScope([pending, approved], {
      managerUserId: pending.managerUserId,
      propertyId: pending.propertyId,
    });
    expect(chosen?.managerUserId).toBe(approved.managerUserId);
  });
});
