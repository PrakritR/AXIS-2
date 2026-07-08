import { describe, expect, it } from "vitest";
import { buildDemoIdleSnapshot } from "@/lib/demo/demo-guided-data";
import {
  DEMO_CANONICAL_RESIDENT_APP_DEMO_ID,
  DEMO_CANONICAL_RESIDENT_CHARGE_APP_REF,
  remapDemoSnapshotForDb,
} from "@/lib/demo/demo-portfolio-db-remap";
import { CANONICAL_DEMO_RESIDENT_EMAIL, CANONICAL_DEMO_VENDOR_EMAIL } from "@/lib/demo/demo-canonical-accounts";
import {
  DEMO_MANAGER_USER_ID,
  DEMO_RESIDENT_USER_ID,
  DEMO_VENDOR_USER_ID,
} from "@/lib/demo/demo-session";

const ctx = {
  managerUserId: "mgr-uuid-1111",
  residentUserId: "res-uuid-2222",
  vendorUserId: "ven-uuid-3333",
  residentEmail: CANONICAL_DEMO_RESIDENT_EMAIL,
  vendorEmail: CANONICAL_DEMO_VENDOR_EMAIL,
  residentAxisId: "AXIS-TESTRSID",
};

describe("remapDemoSnapshotForDb", () => {
  it("rewrites synthetic demo scope ids to real auth UUIDs", () => {
    const snapshot = remapDemoSnapshotForDb(buildDemoIdleSnapshot(), ctx);
    expect(snapshot.properties.every((p) => p.managerUserId === ctx.managerUserId)).toBe(true);
    expect(snapshot.applications.every((a) => a.managerUserId === ctx.managerUserId)).toBe(true);
    const alexApp = snapshot.applications.find((a) => a.email === ctx.residentEmail);
    expect(alexApp?.id).toBe(ctx.residentAxisId);
    expect(snapshot.charges.some((c) => c.applicationId === ctx.residentAxisId)).toBe(true);
    expect(
      snapshot.charges
        .filter((c) => c.residentEmail === ctx.residentEmail)
        .every((c) => c.residentUserId === ctx.residentUserId),
    ).toBe(true);
    const primaryVendor = snapshot.vendors.find((v) => v.id === "demo-vendor-1");
    expect(primaryVendor?.vendorUserId).toBe(ctx.vendorUserId);
    expect(primaryVendor?.email).toBe(ctx.vendorEmail);
    expect(snapshot.workOrderBids.every((b) => b.vendorUserId === ctx.vendorUserId)).toBe(true);
  });

  it("maps canonical resident application refs from demo ids", () => {
    const idle = buildDemoIdleSnapshot();
    expect(idle.applications.some((a) => a.id === DEMO_CANONICAL_RESIDENT_APP_DEMO_ID)).toBe(true);
    expect(idle.charges.some((c) => c.applicationId === DEMO_CANONICAL_RESIDENT_CHARGE_APP_REF)).toBe(true);
    const snapshot = remapDemoSnapshotForDb(idle, ctx);
    expect(snapshot.applications.some((a) => a.id === DEMO_CANONICAL_RESIDENT_APP_DEMO_ID)).toBe(false);
    expect(snapshot.applications.some((a) => a.id === ctx.residentAxisId)).toBe(true);
    expect(snapshot.charges.some((c) => c.applicationId === DEMO_CANONICAL_RESIDENT_CHARGE_APP_REF)).toBe(false);
    expect(snapshot.charges.some((c) => c.applicationId === ctx.residentAxisId)).toBe(true);
  });

  it("does not leak demo session ids on manager-scoped rows", () => {
    const snapshot = remapDemoSnapshotForDb(buildDemoIdleSnapshot(), ctx);
    const json = JSON.stringify(snapshot);
    expect(json.includes(`"${DEMO_MANAGER_USER_ID}"`)).toBe(false);
    expect(json.includes(`"${DEMO_RESIDENT_USER_ID}"`)).toBe(false);
    expect(json.includes(`"${DEMO_VENDOR_USER_ID}"`)).toBe(false);
  });
});
