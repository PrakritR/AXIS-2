import { describe, expect, it, afterEach } from "vitest";
import {
  CANONICAL_DEMO_ADMIN_EMAIL,
  CANONICAL_DEMO_GUIDED_EMAIL,
  CANONICAL_DEMO_MANAGER_EMAIL,
  CANONICAL_DEMO_RESIDENT_EMAIL,
  CANONICAL_DEMO_VENDOR_EMAIL,
} from "@/lib/demo/demo-canonical-accounts";
import {
  buildDemoBlankSnapshot,
  buildDemoIdleSnapshot,
} from "@/lib/demo/demo-guided-data";
import { exitGuidedDemoTour, startGuidedDemoTour } from "@/lib/demo/demo-guided";
import {
  DEMO_GUIDED_EMAIL,
  DEMO_GUIDED_USER_ID,
  DEMO_MANAGER_EMAIL,
  DEMO_RESIDENT_EMAIL,
  DEMO_VENDOR_EMAIL,
  demoSessionForRole,
} from "@/lib/demo/demo-session";

describe("demo-canonical-accounts", () => {
  it("uses @test.axis.local sandbox emails", () => {
    expect(CANONICAL_DEMO_MANAGER_EMAIL).toBe("manager@test.axis.local");
    expect(CANONICAL_DEMO_RESIDENT_EMAIL).toBe("resident@test.axis.local");
    expect(CANONICAL_DEMO_VENDOR_EMAIL).toBe("vendor@test.axis.local");
    expect(CANONICAL_DEMO_ADMIN_EMAIL).toBe("testeverything@test.axis.local");
    expect(CANONICAL_DEMO_GUIDED_EMAIL).toBe(CANONICAL_DEMO_ADMIN_EMAIL);
  });

  it("demo session re-exports canonical emails", () => {
    expect(DEMO_MANAGER_EMAIL).toBe(CANONICAL_DEMO_MANAGER_EMAIL);
    expect(DEMO_RESIDENT_EMAIL).toBe(CANONICAL_DEMO_RESIDENT_EMAIL);
    expect(DEMO_VENDOR_EMAIL).toBe(CANONICAL_DEMO_VENDOR_EMAIL);
  });
});

describe("demo-guided session", () => {
  afterEach(() => {
    exitGuidedDemoTour();
  });

  it("guided tour uses the everything test account", () => {
    startGuidedDemoTour();
    const session = demoSessionForRole("manager");
    expect(session.userId).toBe(DEMO_GUIDED_USER_ID);
    expect(session.email).toBe(DEMO_GUIDED_EMAIL);
  });
});

describe("demo-guided-data snapshots", () => {
  it("idle snapshot ships empty — no fictional portfolio in the public sandbox", () => {
    const snapshot = buildDemoIdleSnapshot();
    expect(snapshot.properties).toEqual([]);
    expect(snapshot.applications).toEqual([]);
    expect(snapshot.charges).toEqual([]);
    expect(snapshot.leases).toEqual([]);
    expect(snapshot.workOrders).toEqual([]);
    expect(snapshot.managerInbox).toEqual([]);
    expect(snapshot.residentInbox).toEqual([]);
    expect(snapshot.vendorInbox).toEqual([]);
    expect(snapshot.schedule.plannedEvents).toEqual([]);
    expect(snapshot.schedule.partnerInquiries).toEqual([]);
    expect(snapshot.residentUploads).toEqual([]);
  });

  it("blank snapshot clears portfolio for guided tour", () => {
    const snapshot = buildDemoBlankSnapshot();
    expect(snapshot.properties).toEqual([]);
    expect(snapshot.applications).toEqual([]);
    expect(snapshot.workOrders).toEqual([]);
    expect(snapshot.managerInbox).toEqual([]);
  });

  it("idle and blank snapshots are independent objects", () => {
    const a = buildDemoIdleSnapshot();
    const b = buildDemoIdleSnapshot();
    a.properties.push({ id: "x" } as (typeof a.properties)[number]);
    expect(b.properties).toEqual([]);
    expect(buildDemoBlankSnapshot().properties).toEqual([]);
  });
});
