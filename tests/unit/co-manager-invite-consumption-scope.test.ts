import { describe, expect, it } from "vitest";
import {
  collectLinkedPropertyIdsForUser,
  collectLinkedPropertyPermissionsForUser,
  managerHasCoManagerPermissionForProperty,
} from "@/lib/auth/manager-lease-scope";

/**
 * Validating `assigned_property_ids` on write closes the hole only for rows
 * created afterwards. Links forged before the gate shipped are already sitting
 * in `account_link_invites` with status `accepted`, and a property assigned
 * legitimately can be transferred to another manager later. So the scope
 * resolvers re-derive ownership every time they turn a link into access.
 */

const INVITER = "mgr-inviter";
const INVITEE = "mgr-invitee";
const VICTIM_OWNER = "mgr-victim";
const OWNED = "prop-owned-by-inviter";
const STOLEN = "prop-owned-by-victim";

/** Minimal PostgREST-shaped stub: select/eq/in/order/limit chain, awaitable or `.maybeSingle()`. */
function makeDb(tables: Record<string, Record<string, unknown>[]>) {
  const build = (table: string, filters: ((row: Record<string, unknown>) => boolean)[]) => {
    const rows = () => (tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
    const chain = {
      select: () => build(table, filters),
      order: () => build(table, filters),
      limit: () => build(table, filters),
      eq: (col: string, value: unknown) => build(table, [...filters, (row) => row[col] === value]),
      in: (col: string, values: unknown[]) => build(table, [...filters, (row) => values.includes(row[col])]),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve({ data: rows(), error: null }).then(resolve, reject),
    };
    return chain;
  };
  return { from: (table: string) => build(table, []) } as never;
}

/** A forged link: accepted, but the inviter never managed the property it names. */
function forgedLinkDb() {
  return makeDb({
    profiles: [
      { id: INVITER, email: "inviter@example.com" },
      { id: INVITEE, email: "invitee@example.com" },
    ],
    manager_property_records: [
      { id: OWNED, manager_user_id: INVITER },
      { id: STOLEN, manager_user_id: VICTIM_OWNER },
    ],
    account_link_invites: [
      {
        status: "accepted",
        inviter_user_id: INVITER,
        invitee_user_id: INVITEE,
        assigned_property_ids: [OWNED, STOLEN],
        property_co_manager_permissions: {},
        co_manager_permissions: {},
      },
    ],
  });
}

describe("co-manager scope is re-derived from ownership at consumption time", () => {
  it("drops an assigned property the inviter does not own", async () => {
    const ids = await collectLinkedPropertyIdsForUser(forgedLinkDb(), INVITEE);
    expect([...ids]).toEqual([OWNED]);
  });

  it("drops it from the per-property permission map too", async () => {
    const perms = await collectLinkedPropertyPermissionsForUser(forgedLinkDb(), INVITEE);
    expect([...perms.keys()]).toEqual([OWNED]);
  });

  it("denies module access on the victim's property despite the accepted link", async () => {
    // An empty permissions object is a FULL grant, so this link would otherwise
    // hand over every module on a property its inviter never managed.
    await expect(
      managerHasCoManagerPermissionForProperty(forgedLinkDb(), INVITEE, STOLEN, "financials"),
    ).resolves.toBe(false);
  });

  it("still grants module access on the property the inviter really owns", async () => {
    await expect(
      managerHasCoManagerPermissionForProperty(forgedLinkDb(), INVITEE, OWNED, "financials"),
    ).resolves.toBe(true);
  });

  it("revokes access once the property is transferred away from the inviter", async () => {
    const db = makeDb({
      profiles: [{ id: INVITER, email: "inviter@example.com" }],
      manager_property_records: [{ id: OWNED, manager_user_id: VICTIM_OWNER }],
      account_link_invites: [
        {
          status: "accepted",
          inviter_user_id: INVITER,
          invitee_user_id: INVITEE,
          assigned_property_ids: [OWNED],
          property_co_manager_permissions: {},
          co_manager_permissions: {},
        },
      ],
    });
    expect([...(await collectLinkedPropertyIdsForUser(db, INVITEE))]).toEqual([]);
    await expect(managerHasCoManagerPermissionForProperty(db, INVITEE, OWNED, "leases")).resolves.toBe(false);
  });

  it("keeps the primary owner's own access untouched", async () => {
    await expect(
      managerHasCoManagerPermissionForProperty(forgedLinkDb(), VICTIM_OWNER, STOLEN, "financials"),
    ).resolves.toBe(true);
  });
});
