import { describe, expect, it } from "vitest";
import { portalSwitchTargets } from "@/lib/portal-switch-targets";

describe("portalSwitchTargets", () => {
  it("offers property portal from admin when user is also a manager", () => {
    const targets = portalSwitchTargets("admin", ["admin", "manager"]);
    expect(targets).toEqual([{ role: "manager", label: "Switch to Property portal" }]);
  });

  it("offers admin portal from property workspace when user is also admin", () => {
    const targets = portalSwitchTargets("pro", ["admin", "manager"]);
    expect(targets).toEqual([{ role: "admin", label: "Switch to Admin portal" }]);
  });

  it("keeps resident switching on property portal", () => {
    const targets = portalSwitchTargets("pro", ["manager", "resident"]);
    expect(targets).toEqual([{ role: "resident", label: "Switch to Resident portal" }]);
  });
});
