import { describe, expect, it } from "vitest";
import type { AuthRole } from "@/components/auth/portal-switcher";
import {
  isPortalRoleReachable,
  reachablePortalRoles,
  normalizePortalRoles,
  type PortalAccessContext,
} from "@/lib/auth/portal-access";
import { portalSwitchTargets } from "@/lib/portal-switch-targets";
import {
  primaryRoleWhenAddingResident,
  primaryRoleWhenAddingVendor,
  primaryRoleWhenAddingManager,
} from "@/lib/auth/profile-primary-role";
import { listMyChargesTool } from "@/lib/tools/domains/resident/balance";
import { makeResidentToolCtx, type FakeRow } from "./tools/fake-resident-ctx";

/**
 * One person can hold independent manager / resident / vendor roles on a single
 * login. These tests lock the two properties that make that safe:
 *
 *  1. Gaining a second role is ADDITIVE — it never converts or downgrades the
 *     role the person already had (a manager who applies to rent stays a
 *     manager), and no second email is required.
 *  2. The roles are ISOLATED — work owned under one role is never visible or
 *     reachable from another, even for the SAME user id.
 */

function ctx(roles: AuthRole[], overrides: Partial<PortalAccessContext> = {}): PortalAccessContext {
  return {
    user: { id: "user-multi", email: "multi@axis.test" },
    profile: null,
    roles,
    effectiveRole: roles.length === 1 ? roles[0]! : null,
    ...overrides,
  };
}

describe("adding a role is additive, never a conversion", () => {
  it("a manager who applies as a resident stays a manager (primary role preserved)", () => {
    // profiles.role is the single legacy column; adding resident must not clobber it.
    expect(primaryRoleWhenAddingResident("manager")).toBe("manager");
    expect(primaryRoleWhenAddingResident("admin")).toBe("admin");
    // A brand-new applicant with no prior role becomes a resident.
    expect(primaryRoleWhenAddingResident(null)).toBe("resident");
    expect(primaryRoleWhenAddingResident("")).toBe("resident");
  });

  it("a manager who also becomes a vendor stays a manager; a resident stays a resident", () => {
    expect(primaryRoleWhenAddingVendor("manager")).toBe("manager");
    expect(primaryRoleWhenAddingVendor("resident")).toBe("resident");
    expect(primaryRoleWhenAddingVendor(null)).toBe("vendor");
  });

  it("a resident who later manages property keeps admin precedence but is promoted from resident", () => {
    expect(primaryRoleWhenAddingManager("admin")).toBe("admin");
    expect(primaryRoleWhenAddingManager("resident")).toBe("manager");
    expect(primaryRoleWhenAddingManager(null)).toBe("manager");
  });

  it("normalizePortalRoles keeps every held role and dedupes — no role is dropped", () => {
    const roles = normalizePortalRoles(
      [{ role: "manager" }, { role: "resident" }, { role: "resident" }, { role: "vendor" }],
      "manager",
    );
    expect(roles).toContain("manager");
    expect(roles).toContain("resident");
    expect(roles).toContain("vendor");
    // Deduped.
    expect(roles.filter((r) => r === "resident")).toEqual(["resident"]);
  });

  it("existing single-role accounts still resolve from the legacy profiles.role fallback", () => {
    // No profile_roles rows yet (pre-migration account) — the legacy column drives it.
    expect(normalizePortalRoles([], "manager")).toEqual(["manager"]);
    expect(normalizePortalRoles([], "owner")).toEqual(["manager"]); // owner → manager
    expect(normalizePortalRoles(null, "resident")).toEqual(["resident"]);
  });
});

describe("portal reachability and switching is role-scoped", () => {
  it("a manager-only account cannot reach the resident or vendor portals", () => {
    const account = ctx(["manager"]);
    expect(isPortalRoleReachable(account, "manager")).toBe(true);
    expect(isPortalRoleReachable(account, "resident")).toBe(false);
    expect(isPortalRoleReachable(account, "vendor")).toBe(false);
    expect(reachablePortalRoles(account)).toEqual(["manager"]);
  });

  it("a manager+resident account can reach both, and switch between them without re-login", () => {
    const account = ctx(["manager", "resident"]);
    expect(reachablePortalRoles(account)).toEqual(["manager", "resident"]);
    // From the property portal, the switcher offers the resident portal…
    expect(portalSwitchTargets("pro", account.roles)).toEqual([
      { role: "resident", label: "Switch to Resident portal" },
    ]);
    // …and from the resident portal it offers the property portal — both directions.
    expect(portalSwitchTargets("resident", account.roles)).toEqual([
      { role: "manager", label: "Switch to Property portal" },
    ]);
  });

  it("the switch gate refuses a role the account does not hold", () => {
    // set-active-portal authorizes on isPortalRoleReachable, so a manager who is
    // not a vendor can never flip the active-portal cookie to vendor.
    const account = ctx(["manager", "resident"]);
    expect(isPortalRoleReachable(account, "vendor")).toBe(false);
    expect(isPortalRoleReachable(account, "admin")).toBe(false);
  });
});

/** A charge that `owner` holds AS MANAGER, but which belongs to `resident`. */
function chargeManagedBy(
  ownerManagerId: string,
  resident: { id: string; email: string },
  id: string,
): FakeRow {
  return {
    id,
    manager_user_id: ownerManagerId,
    resident_user_id: resident.id,
    resident_email: resident.email,
    status: "pending",
    row_data: {
      id,
      residentEmail: resident.email,
      residentName: resident.id,
      residentUserId: resident.id,
      propertyId: "prop_1",
      propertyLabel: "Maple House",
      managerUserId: ownerManagerId,
      kind: "rent",
      title: `Rent ${id}`,
      amountLabel: "$100",
      balanceLabel: "$100",
      status: "pending",
      dueDateLabel: "2026-07-01",
      createdAt: "2026-06-01T00:00:00.000Z",
    },
  };
}

describe("one user id, two roles: manager-owned data never leaks into the resident portal", () => {
  const MULTI = { id: "user_multi", email: "multi@axis.test" }; // holds manager AND resident
  const TENANT = { id: "resident_y", email: "resy@axis.test" }; // MULTI's tenant

  it("MULTI acting as resident cannot see a charge MULTI owns as the manager of another resident", async () => {
    // The row is MULTI's — but MULTI's, as the MANAGER. It belongs to TENANT.
    const managerOwnedTenantCharge = chargeManagedBy(MULTI.id, TENANT, "CH-TENANT");
    // MULTI's own resident charge (MULTI is the resident here).
    const ownResidentCharge = chargeManagedBy("some_other_manager", MULTI, "CH-MINE");

    const { ctx: residentCtx } = makeResidentToolCtx(
      { portal_household_charge_records: [managerOwnedTenantCharge, ownResidentCharge] },
      { userId: MULTI.id, email: MULTI.email, managerIds: ["some_other_manager"] },
    );

    const res = (await listMyChargesTool.handler(residentCtx, {})) as { charges: { id: string }[] };
    const ids = res.charges.map((c) => c.id);

    // Only the charge MULTI owns AS A RESIDENT surfaces. The charge MULTI owns
    // as a MANAGER (belonging to TENANT) is invisible from the resident portal —
    // being someone's landlord does not grant a resident-side read of their row.
    expect(ids).toEqual(["CH-MINE"]);
    expect(ids).not.toContain("CH-TENANT");
    expect(JSON.stringify(res)).not.toContain("resident_y");
  });

  it("the resident tool scope matches only rows keyed to the acting user id/email", async () => {
    // A charge belonging entirely to another resident is never returned even
    // though MULTI is that resident's manager.
    const foreign = chargeManagedBy(MULTI.id, TENANT, "CH-FOREIGN");
    const { ctx: residentCtx } = makeResidentToolCtx(
      { portal_household_charge_records: [foreign] },
      { userId: MULTI.id, email: MULTI.email, managerIds: [MULTI.id] },
    );
    const res = (await listMyChargesTool.handler(residentCtx, {})) as { charges: unknown[] };
    expect(res.charges).toEqual([]);
  });
});
