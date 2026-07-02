import { describe, expect, it } from "vitest";
import { filterRecipientsBySenderScope } from "@/lib/inbox-recipient-scope";
import { PRIMARY_ADMIN_EMAIL } from "@/lib/auth/primary-admin";

/**
 * In-memory stand-in for the Supabase service client covering exactly the query
 * shapes filterRecipientsBySenderScope + managerOwnsResident use:
 *   from(table).select(cols).eq(col, val)                     -> await -> { data }
 *   from(table).select(cols).in(col, arr)                     -> await -> { data }
 *   from(table).select(cols).in(col, arr).eq(col, val).limit  -> await -> { data }
 *   from(table).select(cols).in(col, arr).or(expr).limit      -> await -> { data }
 */
type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

function makeDb(tables: Tables) {
  const rowsFor = (table: string) => tables[table] ?? [];

  function builder(table: string) {
    const filters: Array<(row: Row) => boolean> = [];
    const api: Record<string, unknown> = {
      select: () => api,
      eq: (col: string, val: unknown) => {
        filters.push((row) => String(row[col] ?? "") === String(val));
        return api;
      },
      in: (col: string, vals: unknown[]) => {
        const set = new Set(vals.map((v) => String(v)));
        filters.push((row) => set.has(String(row[col] ?? "")));
        return api;
      },
      or: () => api,
      ilike: (col: string, val: string) => {
        filters.push((row) => String(row[col] ?? "").toLowerCase() === String(val).toLowerCase());
        return api;
      },
      limit: () => api,
      maybeSingle: () => {
        const data = rowsFor(table).filter((row) => filters.every((f) => f(row)))[0] ?? null;
        return Promise.resolve({ data, error: null });
      },
      then: (resolve: (value: { data: Row[]; error: null }) => unknown) => {
        const data = rowsFor(table).filter((row) => filters.every((f) => f(row)));
        return Promise.resolve({ data, error: null }).then(resolve);
      },
    };
    return api;
  }

  return { from: (table: string) => builder(table) } as never;
}

const ADMIN = PRIMARY_ADMIN_EMAIL;

describe("filterRecipientsBySenderScope", () => {
  it("admin sender is unrestricted", async () => {
    const db = makeDb({});
    const { allowed, blocked } = await filterRecipientsBySenderScope(
      db,
      { id: "admin_1", email: "admin@axis.local", role: "admin", isAdmin: true },
      [{ email: "anyone@example.com", userId: "x" }],
    );
    expect(allowed).toHaveLength(1);
    expect(blocked).toHaveLength(0);
  });

  it("manager may message their own resident but not an arbitrary one", async () => {
    const db = makeDb({
      manager_application_records: [
        { manager_user_id: "mgr_1", resident_email: "mine@example.com", row_data: { bucket: "approved" } },
      ],
      portal_household_charge_records: [],
      portal_lease_pipeline_records: [],
      portal_pro_relationship_records: [],
    });
    const sender = { id: "mgr_1", email: "mgr@example.com", role: "manager", isAdmin: false };

    const own = await filterRecipientsBySenderScope(db, sender, [{ email: "mine@example.com", userId: null }]);
    expect(own.allowed.map((r) => r.email)).toEqual(["mine@example.com"]);

    const stranger = await filterRecipientsBySenderScope(db, sender, [{ email: "stranger@example.com", userId: null }]);
    expect(stranger.allowed).toHaveLength(0);
    expect(stranger.blocked).toHaveLength(1);
  });

  it("manager may message a linked co-manager and Axis admin", async () => {
    const db = makeDb({
      manager_application_records: [],
      portal_household_charge_records: [],
      portal_lease_pipeline_records: [],
      portal_pro_relationship_records: [
        { manager_user_id: "mgr_1", related_email: "partner@example.com", related_user_id: "mgr_2" },
      ],
    });
    const sender = { id: "mgr_1", email: "mgr@example.com", role: "manager", isAdmin: false };

    const res = await filterRecipientsBySenderScope(db, sender, [
      { email: "partner@example.com", userId: "mgr_2" },
      { email: ADMIN, userId: null },
      { email: "random-manager@example.com", userId: "mgr_9" },
    ]);
    expect(res.allowed.map((r) => r.email).sort()).toEqual([ADMIN, "partner@example.com"].sort());
    expect(res.blocked.map((r) => r.email)).toEqual(["random-manager@example.com"]);
  });

  it("resident may message their own manager (+admin) but not another resident or arbitrary manager", async () => {
    const db = makeDb({
      manager_application_records: [
        { manager_user_id: "mgr_1", resident_email: "me@example.com", row_data: { bucket: "approved" } },
      ],
      portal_household_charge_records: [],
      portal_lease_pipeline_records: [],
      portal_pro_relationship_records: [
        { manager_user_id: "mgr_1", related_email: "co@example.com", related_user_id: "mgr_2" },
      ],
      profiles: [{ id: "mgr_1", email: "mymanager@example.com" }],
    });
    const sender = { id: "res_1", email: "me@example.com", role: "resident", isAdmin: false };

    const res = await filterRecipientsBySenderScope(db, sender, [
      { email: "mymanager@example.com", userId: "mgr_1" },
      { email: "co@example.com", userId: "mgr_2" },
      { email: ADMIN, userId: null },
      { email: "other-resident@example.com", userId: "res_2" },
      { email: "unrelated-manager@example.com", userId: "mgr_9" },
    ]);
    expect(res.allowed.map((r) => r.email).sort()).toEqual(
      ["mymanager@example.com", "co@example.com", ADMIN].sort(),
    );
    expect(res.blocked.map((r) => r.email).sort()).toEqual(
      ["other-resident@example.com", "unrelated-manager@example.com"].sort(),
    );
  });

  it("resident with no manager relationship can still reach Axis admin only", async () => {
    const db = makeDb({
      manager_application_records: [],
      portal_household_charge_records: [],
      portal_lease_pipeline_records: [],
      portal_pro_relationship_records: [],
      profiles: [],
    });
    const sender = { id: "res_1", email: "me@example.com", role: "resident", isAdmin: false };
    const res = await filterRecipientsBySenderScope(db, sender, [
      { email: ADMIN, userId: null },
      { email: "someone@example.com", userId: "u2" },
    ]);
    expect(res.allowed.map((r) => r.email)).toEqual([ADMIN]);
    expect(res.blocked.map((r) => r.email)).toEqual(["someone@example.com"]);
  });
});
