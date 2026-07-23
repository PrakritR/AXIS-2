import { describe, it, expect } from "vitest";
import { persistPendingAction, claimPendingAction } from "@/lib/tools/pending-actions";

/**
 * In-memory stand-in for the agent_pending_actions table that models the
 * pieces the module depends on: insert-returning-id, and the atomic claim
 * UPDATE with its status/expiry/actor WHERE clause.
 */
type Row = Record<string, unknown> & { id: string };

function makeFakeDb() {
  const rows: Row[] = [];
  let counter = 0;

  function matches(row: Row, filters: [string, string, unknown][]): boolean {
    return filters.every(([op, col, val]) => {
      if (op === "eq") return row[col] === val;
      if (op === "gt") return String(row[col] ?? "") > String(val ?? "");
      return true;
    });
  }

  const db = {
    from(table: string) {
      if (table !== "agent_pending_actions") throw new Error(`unexpected table ${table}`);
      return {
        insert(values: Record<string, unknown>) {
          const row: Row = { id: `pa_${++counter}-0000-4000-8000-000000000000`, ...values };
          rows.push(row);
          return {
            select() {
              return {
                single: async () => ({ data: { id: row.id }, error: null }),
              };
            },
          };
        },
        update(values: Record<string, unknown>) {
          const filters: [string, string, unknown][] = [];
          const chain = {
            eq(col: string, val: unknown) {
              filters.push(["eq", col, val]);
              return chain;
            },
            gt(col: string, val: unknown) {
              filters.push(["gt", col, val]);
              return chain;
            },
            select() {
              return {
                maybeSingle: async () => {
                  const hit = rows.find((r) => matches(r, filters));
                  if (!hit) return { data: null, error: null };
                  Object.assign(hit, values);
                  return { data: { ...hit }, error: null };
                },
              };
            },
            // updates without .select() (the supersede pass) are awaitable
            then(resolve: (v: { error: null }) => unknown) {
              for (const r of rows) if (matches(r, filters)) Object.assign(r, values);
              return Promise.resolve({ error: null }).then(resolve);
            },
          };
          return chain;
        },
        select() {
          const filters: [string, string, unknown][] = [];
          const chain = {
            eq(col: string, val: unknown) {
              filters.push(["eq", col, val]);
              return chain;
            },
            maybeSingle: async () => {
              const hit = rows.find((r) => matches(r, filters));
              return { data: hit ? { ...hit } : null, error: null };
            },
          };
          return chain;
        },
      };
    },
  };
  return { db, rows };
}

const preview = { title: "Do thing", summary: "Will do.", lines: [] };

describe("pending actions", () => {
  it("persists a proposal and returns the wire shape without the raw input", async () => {
    const { db } = makeFakeDb();
    const pending = await persistPendingAction(
      { userId: "user_a", landlordId: "user_a", db },
      { portal: "manager", toolName: "do_thing", input: { targetId: "t1" }, preview, destructive: false },
    );
    expect(pending).toBeTruthy();
    expect(pending!.toolName).toBe("do_thing");
    expect(pending!.preview).toEqual(preview);
    expect("input" in pending!).toBe(false);
  });

  it("supersedes prior pending proposals for the same actor", async () => {
    const { db, rows } = makeFakeDb();
    const actor = { userId: "user_a", landlordId: "user_a", db };
    await persistPendingAction(actor, {
      portal: "manager",
      toolName: "first",
      input: {},
      preview,
      destructive: false,
    });
    await persistPendingAction(actor, {
      portal: "manager",
      toolName: "second",
      input: {},
      preview,
      destructive: false,
    });
    const statuses = rows.map((r) => [r.tool_name, r.status]);
    expect(statuses).toContainEqual(["first", "superseded"]);
    expect(statuses).toContainEqual(["second", "pending"]);
  });

  it("claims exactly once — a second confirm reports already_resolved", async () => {
    const { db } = makeFakeDb();
    const actor = { userId: "user_a", landlordId: "user_a", db };
    const pending = await persistPendingAction(actor, {
      portal: "manager",
      toolName: "do_thing",
      input: { targetId: "t1" },
      preview,
      destructive: false,
    });

    const first = await claimPendingAction(actor, pending!.id, "confirm");
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.row.input).toEqual({ targetId: "t1" });

    const second = await claimPendingAction(actor, pending!.id, "confirm");
    expect(second).toEqual({ ok: false, reason: "already_resolved" });
  });

  it("a foreign actor's claim reads as not_found (anti-enumeration)", async () => {
    const { db } = makeFakeDb();
    const owner = { userId: "user_a", landlordId: "user_a", db };
    const stranger = { userId: "user_b", landlordId: "user_b", db };
    const pending = await persistPendingAction(owner, {
      portal: "manager",
      toolName: "do_thing",
      input: {},
      preview,
      destructive: false,
    });

    const claim = await claimPendingAction(stranger, pending!.id, "confirm");
    expect(claim).toEqual({ ok: false, reason: "not_found" });

    // ...and the owner can still claim it afterwards.
    const ownerClaim = await claimPendingAction(owner, pending!.id, "confirm");
    expect(ownerClaim.ok).toBe(true);
  });

  it("an expired proposal cannot be claimed", async () => {
    const { db, rows } = makeFakeDb();
    const actor = { userId: "user_a", landlordId: "user_a", db };
    const pending = await persistPendingAction(actor, {
      portal: "manager",
      toolName: "do_thing",
      input: {},
      preview,
      destructive: false,
    });
    // Force-expire the row.
    rows.find((r) => r.id === pending!.id)!.expires_at = new Date(Date.now() - 1000).toISOString();

    const claim = await claimPendingAction(actor, pending!.id, "confirm");
    expect(claim).toEqual({ ok: false, reason: "expired" });
  });

  it("cancel claims the row with cancelled status", async () => {
    const { db, rows } = makeFakeDb();
    const actor = { userId: "user_a", landlordId: "user_a", db };
    const pending = await persistPendingAction(actor, {
      portal: "manager",
      toolName: "do_thing",
      input: {},
      preview,
      destructive: false,
    });

    const claim = await claimPendingAction(actor, pending!.id, "cancel");
    expect(claim.ok).toBe(true);
    expect(rows.find((r) => r.id === pending!.id)!.status).toBe("cancelled");
  });
});
