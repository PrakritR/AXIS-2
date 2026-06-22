import { describe, expect, it } from "vitest";
import { leaseRecordVisibleToManager } from "@/lib/auth/manager-lease-scope";

describe("manager-lease-scope", () => {
  it("shows own manager records", () => {
    expect(leaseRecordVisibleToManager({ manager_user_id: "u1", property_id: "p1" }, "u1", new Set())).toBe(true);
  });

  it("shows linked property records", () => {
    expect(
      leaseRecordVisibleToManager({ manager_user_id: "u2", property_id: "p1" }, "u1", new Set(["p1"])),
    ).toBe(true);
    expect(
      leaseRecordVisibleToManager({ manager_user_id: "u2", property_id: "p2" }, "u1", new Set(["p1"])),
    ).toBe(false);
  });
});
