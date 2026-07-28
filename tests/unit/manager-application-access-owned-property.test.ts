/**
 * Regression for the manager-side identity mismatch: the Applications LIST shows
 * a row via property ownership, but per-id ACTIONS (view PDF, delete) used a
 * stricter test (the frozen `manager_user_id` stamp / co-manager links only) and
 * 403'd on the manager's OWN applicant — an "Incomplete" draft on a property
 * they own keeps a stale/unattributed stamp.
 *
 * `managerCanAccessApplicationRecord` is the ONE predicate both the list and the
 * by-id actions now share, so they can never disagree again. It is also
 * level-aware: visibility ("read") never implies destruction ("delete") for a
 * co-manager, while a direct owner always passes. Driven directly against a
 * stubbed Supabase client.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CoManagerPermissionLevel } from "@/lib/co-manager-permissions";

const OWNER = "mgr-owner-1";
const STRANGER = "mgr-stranger-2";
const CO_MANAGER = "mgr-comanager-3";
const STALE_STAMP = "00000000-0000-0000-0000-000000000000";
const OWNED_PROPERTY = "mgr-parity-brooklyn";

let OWNED_PROPERTY_IDS: Record<string, string[]> = {}; // userId -> property ids they own
// userId -> propertyId -> levels the co-manager link grants
let CO_MANAGER_GRANTS: Record<string, Record<string, CoManagerPermissionLevel[]>> = {};

vi.mock("@/lib/auth/manager-lease-scope", () => ({
  managerHasCoManagerPermissionForProperty: vi.fn(
    async (
      _db: unknown,
      userId: string,
      propertyId: string,
      _module: string,
      level: CoManagerPermissionLevel = "read",
    ) => (CO_MANAGER_GRANTS[userId]?.[propertyId] ?? []).includes(level),
  ),
}));

function makeDb() {
  return {
    from(table: string) {
      const state: { eqManager: string | null } = { eqManager: null };
      // `managerOwnedPropertyIdSet` fetches EVERY property the manager owns
      // (`.select("id").eq("manager_user_id", userId)`) and the predicate filters
      // by candidate id in memory — so the stub returns the full owned set.
      const ownedRows = (): { data: { id: string }[]; error: null } => {
        if (table === "manager_property_records") {
          return { data: (OWNED_PROPERTY_IDS[state.eqManager ?? ""] ?? []).map((id) => ({ id })), error: null };
        }
        return { data: [], error: null };
      };
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq(column: string, value: string) {
          if (column === "manager_user_id") state.eqManager = value;
          return builder;
        },
        in() {
          return builder;
        },
        limit() {
          return Promise.resolve(ownedRows());
        },
        then(resolve: (v: { data: { id: string }[]; error: null }) => unknown) {
          return Promise.resolve(ownedRows()).then(resolve);
        },
      };
      return builder;
    },
  };
}

async function canAccess(
  userId: string,
  record: Record<string, unknown>,
  options?: { level?: CoManagerPermissionLevel },
) {
  const { managerCanAccessApplicationRecord } = await import("@/lib/auth/manager-application-access");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return managerCanAccessApplicationRecord(makeDb() as any, userId, record as any, options);
}

beforeEach(() => {
  vi.clearAllMocks();
  OWNED_PROPERTY_IDS = { [OWNER]: [OWNED_PROPERTY] };
  CO_MANAGER_GRANTS = {};
});

describe("managerCanAccessApplicationRecord — property ownership, not the frozen stamp", () => {
  it("allows the owner of the property even when manager_user_id is a STALE stamp", async () => {
    const allowed = await canAccess(OWNER, {
      manager_user_id: STALE_STAMP,
      property_id: OWNED_PROPERTY,
      assigned_property_id: null,
    });
    expect(allowed).toBe(true);
  });

  it("allows a record whose stored manager_user_id matches directly", async () => {
    expect(await canAccess(OWNER, { manager_user_id: OWNER, property_id: "some-other-prop" })).toBe(true);
  });

  it("denies a manager who neither owns the property nor holds the stamp", async () => {
    const allowed = await canAccess(STRANGER, {
      manager_user_id: STALE_STAMP,
      property_id: OWNED_PROPERTY,
      assigned_property_id: null,
    });
    expect(allowed).toBe(false);
  });

  it("matches on assigned_property_id too (post-approval attribution)", async () => {
    expect(
      await canAccess(OWNER, { manager_user_id: STALE_STAMP, property_id: "", assigned_property_id: OWNED_PROPERTY }),
    ).toBe(true);
  });
});

describe("managerCanAccessApplicationRecord — co-manager level gating", () => {
  const record = {
    manager_user_id: STALE_STAMP,
    property_id: OWNED_PROPERTY,
    assigned_property_id: null,
  };

  it("read-level co-manager may SEE (level 'read') but is REFUSED at level 'delete'", async () => {
    CO_MANAGER_GRANTS = { [CO_MANAGER]: { [OWNED_PROPERTY]: ["read"] } };
    expect(await canAccess(CO_MANAGER, record)).toBe(true);
    expect(await canAccess(CO_MANAGER, record, { level: "read" })).toBe(true);
    expect(await canAccess(CO_MANAGER, record, { level: "delete" })).toBe(false);
  });

  it("delete-level co-manager is allowed at level 'delete'", async () => {
    CO_MANAGER_GRANTS = { [CO_MANAGER]: { [OWNED_PROPERTY]: ["read", "edit", "delete"] } };
    expect(await canAccess(CO_MANAGER, record, { level: "delete" })).toBe(true);
  });

  it("direct owner is always allowed, including at level 'delete'", async () => {
    expect(await canAccess(OWNER, record, { level: "delete" })).toBe(true);
  });

  it("a matching manager_user_id stamp is always allowed, including at level 'delete'", async () => {
    expect(await canAccess(OWNER, { manager_user_id: OWNER, property_id: "some-other-prop" }, { level: "delete" })).toBe(
      true,
    );
  });
});
