import { describe, it, expect } from "vitest";
import {
  claimPendingAction,
  createPendingActionForUser,
  denyPendingAction,
  listProposedActionsForUser,
  markPendingActionFailed,
  peekPendingActionPortal,
} from "@/lib/tools/pending-actions";
import type { ActionPreview } from "@/lib/tools/registry";

/**
 * In-memory stand-in for the agent_pending_actions table modelling the pieces
 * the module depends on: insert-returning-id (with the `expires_at` column
 * default), the atomic claim UPDATE with its status/expiry/actor WHERE clause,
 * and the scoped follow-up reads.
 */
type Row = Record<string, unknown> & { id: string };
type Filter = [op: "eq" | "gt", col: string, val: unknown];

const DEFAULT_TTL_MS = 15 * 60_000;

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every(([op, col, val]) => {
    if (op === "eq") return row[col] === val;
    return String(row[col] ?? "") > String(val ?? "");
  });
}

function makeFakeDb() {
  const rows: Row[] = [];
  let counter = 0;

  const db = {
    from(table: string) {
      if (table !== "agent_pending_actions") throw new Error(`unexpected table ${table}`);
      return {
        insert(values: Record<string, unknown>) {
          const row: Row = {
            id: `pa_${++counter}-0000-4000-8000-000000000000`,
            status: "proposed",
            created_at: new Date(Date.now() + counter).toISOString(),
            expires_at: new Date(Date.now() + DEFAULT_TTL_MS).toISOString(),
            ...values,
          };
          rows.push(row);
          return { select: () => ({ single: async () => ({ data: { id: row.id }, error: null }) }) };
        },
        update(values: Record<string, unknown>) {
          const filters: Filter[] = [];
          const apply = () => {
            const hits = rows.filter((r) => matches(r, filters));
            for (const r of hits) Object.assign(r, values);
            return hits.map((r) => ({ ...r }));
          };
          const chain = {
            eq(col: string, val: unknown) {
              filters.push(["eq", col, val]);
              return chain;
            },
            gt(col: string, val: unknown) {
              filters.push(["gt", col, val]);
              return chain;
            },
            select: () => ({
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              then: (resolve: (v: any) => unknown) => Promise.resolve({ data: apply(), error: null }).then(resolve),
            }),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            then: (resolve: (v: any) => unknown) => {
              apply();
              return Promise.resolve({ error: null }).then(resolve);
            },
          };
          return chain;
        },
        select() {
          const filters: Filter[] = [];
          const chain = {
            eq(col: string, val: unknown) {
              filters.push(["eq", col, val]);
              return chain;
            },
            gt(col: string, val: unknown) {
              filters.push(["gt", col, val]);
              return chain;
            },
            order: () => chain,
            maybeSingle: async () => {
              const hit = rows.find((r) => matches(r, filters));
              return { data: hit ? { ...hit } : null, error: null };
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            then: (resolve: (v: any) => unknown) =>
              Promise.resolve({ data: rows.filter((r) => matches(r, filters)).map((r) => ({ ...r })), error: null }).then(
                resolve,
              ),
          };
          return chain;
        },
      };
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { db: db as any, rows };
}

const preview: ActionPreview = {
  kind: "do_thing",
  title: "Do thing",
  confirmLabel: "Do it",
  fields: [{ label: "Target", value: "t1" }],
};

function propose(db: unknown, args: Partial<Parameters<typeof createPendingActionForUser>[1]> = {}) {
  return createPendingActionForUser(db as never, {
    landlordId: "user_a",
    userId: "user_a",
    toolName: "do_thing",
    input: { targetId: "t1" },
    preview,
    ...args,
  });
}

describe("pending actions", () => {
  it("persists a proposal anchored to the actor and returns only its id", async () => {
    const { db, rows } = makeFakeDb();
    const id = await propose(db);
    expect(id).toBeTruthy();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.user_id).toBe("user_a");
    expect(rows[0]!.status).toBe("proposed");
    expect(rows[0]!.tool_name).toBe("do_thing");
  });

  it("keeps every open proposal — a newer one never supersedes an older one", async () => {
    // Deliberate: the dashboard lists every open proposal as an approvable "AI
    // draft" chip, and the approval-first tour flow parks long-lived proposals
    // in the same table. Superseding would silently drop those.
    const { db } = makeFakeDb();
    await propose(db, { toolName: "first" });
    await propose(db, { toolName: "second" });
    const first = await listProposedActionsForUser(db as never, { userId: "user_a", toolName: "first" });
    const second = await listProposedActionsForUser(db as never, { userId: "user_a", toolName: "second" });
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
  });

  it("claims exactly once — a second confirm gets nothing", async () => {
    const { db } = makeFakeDb();
    const actor = { userId: "user_a", db };
    const id = await propose(db);

    const first = await claimPendingAction(actor, id!);
    expect(first).toMatchObject({ toolName: "do_thing", input: { targetId: "t1" }, portal: "manager" });

    const second = await claimPendingAction(actor, id!);
    expect(second).toBeNull();
  });

  it("a foreign actor cannot claim, and the owner still can afterwards", async () => {
    const { db } = makeFakeDb();
    const owner = { userId: "user_a", db };
    const stranger = { userId: "user_b", db };
    const id = await propose(db);

    expect(await claimPendingAction(stranger, id!)).toBeNull();
    expect(await claimPendingAction(owner, id!)).toBeTruthy();
  });

  it("an expired proposal cannot be claimed", async () => {
    const { db, rows } = makeFakeDb();
    const actor = { userId: "user_a", db };
    const id = await propose(db);
    rows.find((r) => r.id === id)!.expires_at = new Date(Date.now() - 1000).toISOString();
    expect(await claimPendingAction(actor, id!)).toBeNull();
  });

  it("honors an explicit long expiry (the 7-day tour approval queue)", async () => {
    const { db, rows } = makeFakeDb();
    const id = await propose(db, { expiresInMs: 7 * 24 * 60 * 60_000 });
    const expiresAt = new Date(String(rows.find((r) => r.id === id)!.expires_at)).getTime();
    expect(expiresAt - Date.now()).toBeGreaterThan(6 * 24 * 60 * 60_000);
  });

  it("deny marks the row denied so it can never execute", async () => {
    const { db, rows } = makeFakeDb();
    const actor = { userId: "user_a", db };
    const id = await propose(db);
    expect(await denyPendingAction(actor, id!)).toBe(true);
    expect(rows[0]!.status).toBe("denied");
    expect(await claimPendingAction(actor, id!)).toBeNull();
  });

  it("records a failed execution instead of leaving the row reading 'executed'", async () => {
    const { db, rows } = makeFakeDb();
    const actor = { userId: "user_a", db };
    const id = await propose(db);
    await claimPendingAction(actor, id!);
    await markPendingActionFailed(actor, id!);
    expect(rows[0]!.status).toBe("failed");
  });

  it("peeks a proposal's portal actor-scoped, without claiming it", async () => {
    const { db, rows } = makeFakeDb();
    const id = await propose(db, { portal: "resident" });
    expect(await peekPendingActionPortal({ userId: "user_a", db }, id!)).toEqual({
      portal: "resident",
      toolName: "do_thing",
    });
    expect(await peekPendingActionPortal({ userId: "user_b", db }, id!)).toBeNull();
    expect(rows[0]!.status).toBe("proposed");
  });
});
