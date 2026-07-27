/**
 * Regression for the manager-side identity mismatch: the Applications LIST shows
 * a row via property ownership, but per-id ACTIONS (view PDF, delete) used a
 * stricter test (the frozen `manager_user_id` stamp / co-manager links only) and
 * 403'd on the manager's OWN applicant — an "Incomplete" draft on a property
 * they own keeps a stale/unattributed stamp.
 *
 * `managerCanAccessApplicationRecord` is the ONE predicate both the list and the
 * by-id actions now share, so they can never disagree again. Driven directly
 * against a stubbed Supabase client.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = "mgr-owner-1";
const STRANGER = "mgr-stranger-2";
const STALE_STAMP = "00000000-0000-0000-0000-000000000000";
const OWNED_PROPERTY = "mgr-parity-brooklyn";

let OWNED_PROPERTY_IDS: Record<string, string[]> = {}; // userId -> property ids they own

vi.mock("@/lib/auth/co-manager-module-scope", () => ({
  // No co-manager grants in these cases — isolates the DIRECT-ownership path.
  linkedPropertyIdsForModule: vi.fn(async () => new Set<string>()),
}));

function makeDb() {
  return {
    from(table: string) {
      const state: { eqManager: string | null; inIds: string[] | null } = { eqManager: null, inIds: null };
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq(column: string, value: string) {
          if (column === "manager_user_id") state.eqManager = value;
          return builder;
        },
        in(column: string, values: string[]) {
          if (column === "id") state.inIds = values;
          return builder;
        },
        limit() {
          if (table === "manager_property_records") {
            const owned = OWNED_PROPERTY_IDS[state.eqManager ?? ""] ?? [];
            const match = (state.inIds ?? []).filter((id) => owned.includes(id)).map((id) => ({ id }));
            return Promise.resolve({ data: match, error: null });
          }
          return Promise.resolve({ data: [], error: null });
        },
      };
      return builder;
    },
  };
}

async function canAccess(userId: string, record: Record<string, unknown>) {
  const { managerCanAccessApplicationRecord } = await import("@/lib/auth/manager-application-access");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return managerCanAccessApplicationRecord(makeDb() as any, userId, record as any);
}

beforeEach(() => {
  vi.clearAllMocks();
  OWNED_PROPERTY_IDS = { [OWNER]: [OWNED_PROPERTY] };
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
