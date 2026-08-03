import { beforeEach, describe, expect, it, vi } from "vitest";
import { leaseRecordVisibleToManager, managerMayFileLeaseUnderProperty } from "@/lib/auth/manager-lease-scope";

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

/**
 * The route's ownership notion is WIDER than direct ownership: a co-manager
 * assigned a property may work on its leases, so validating a client-named
 * `property_id` with a direct-ownership-only helper would refuse a real flow.
 */
describe("managerMayFileLeaseUnderProperty", () => {
  const MANAGER = "manager-1";

  let ownedIds: string[] = [];
  let linkRows: Array<{ inviter_user_id: string; assigned_property_ids: string[] }> = [];
  let ownershipError: { message: string } | null = null;

  /** Only the surface this helper and collectLinkedPropertyIdsForUser touch. */
  function makeDb() {
    return {
      from(table: string) {
        const filters: Array<[string, unknown]> = [];
        const builder: Record<string, unknown> = {
          select: () => builder,
          in: () => builder,
          eq: (column: string, value: unknown) => {
            filters.push([column, value]);
            if (table === "account_link_invites" && filters.length === 2) {
              return Promise.resolve({ data: linkRows, error: null });
            }
            return builder;
          },
          maybeSingle() {
            if (table === "profiles") return Promise.resolve({ data: { email: "manager@example.com" }, error: null });
            if (table === "manager_property_records") {
              if (ownershipError) return Promise.resolve({ data: null, error: ownershipError });
              const id = filters.find(([column]) => column === "id")?.[1];
              const owner = filters.find(([column]) => column === "manager_user_id")?.[1];
              const match = owner === MANAGER && ownedIds.includes(String(id));
              return Promise.resolve({ data: match ? { id } : null, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          },
          then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
            return Promise.resolve({ data: [], error: null }).then(resolve, reject);
          },
        };
        return builder;
      },
    };
  }

  const check = (propertyId: string) =>
    managerMayFileLeaseUnderProperty(makeDb() as never, MANAGER, propertyId);

  beforeEach(() => {
    ownedIds = [];
    linkRows = [];
    ownershipError = null;
    vi.restoreAllMocks();
  });

  it("allows a property the manager owns directly", async () => {
    ownedIds = ["prop-own"];
    expect(await check("prop-own")).toEqual({ ok: true, allowed: true });
  });

  it("allows a property assigned via an accepted co-manager link", async () => {
    linkRows = [{ inviter_user_id: "other-manager", assigned_property_ids: ["prop-linked"] }];
    expect(await check("prop-linked")).toEqual({ ok: true, allowed: true });
  });

  it("refuses a property that is neither owned nor linked", async () => {
    ownedIds = ["prop-own"];
    linkRows = [{ inviter_user_id: "other-manager", assigned_property_ids: ["prop-linked"] }];
    expect(await check("prop-stranger")).toEqual({ ok: true, allowed: false });
  });

  it("refuses an empty id without a lookup", async () => {
    expect(await check("  ")).toEqual({ ok: true, allowed: false });
  });

  it("fails closed and logs when the ownership read errors", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    ownershipError = { message: "connection reset" };
    expect(await check("prop-own")).toEqual({ ok: false, error: "connection reset" });
    expect(logged).toHaveBeenCalled();
  });
});
