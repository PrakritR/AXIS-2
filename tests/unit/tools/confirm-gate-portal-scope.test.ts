import { describe, expect, it } from "vitest";
import { z } from "zod";
import { runConfirmedPendingActionForPortal } from "@/lib/tools/confirm-gate.server";
import { buildRegistry, defineWriteTool } from "@/lib/tools/registry";

/**
 * `schedule_message` (and friends) exist under the SAME name in the manager and
 * resident maps as different, role-scoped implementations. The pending-action
 * row therefore records the portal it was proposed from, and the confirm gate
 * refuses a claim whose portal does not match the CALLER's — otherwise a user
 * holding two roles could confirm a resident-scoped proposal against the
 * manager tool of the same name.
 */
type Row = Record<string, unknown> & { id: string };

const ACTOR = "user_a";
const ACTION_ID = "act_1";

function makeDb(rows: Row[]) {
  const matches = (row: Row, filters: [string, string, unknown][]) =>
    filters.every(([op, col, val]) =>
      op === "eq" ? row[col] === val : String(row[col] ?? "") > String(val ?? ""),
    );
  return {
    from() {
      const filters: [string, string, unknown][] = [];
      let update: Row | null = null;
      const apply = () => {
        const hits = rows.filter((r) => matches(r, filters));
        for (const r of hits) Object.assign(r, update ?? {});
        return hits.map((r) => ({ ...r }));
      };
      const chain: Record<string, unknown> = {
        select: () => chain,
        update: (values: Row) => {
          update = values;
          return chain;
        },
        eq: (col: string, val: unknown) => {
          filters.push(["eq", col, val]);
          return chain;
        },
        gt: (col: string, val: unknown) => {
          filters.push(["gt", col, val]);
          return chain;
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        then: (resolve: (v: any) => unknown) => Promise.resolve({ data: apply(), error: null }).then(resolve),
      };
      return chain;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

let executed = 0;
const registry = buildRegistry([
  defineWriteTool({
    name: "schedule_message",
    description: "Manager-scoped schedule.",
    inputSchema: z.object({ body: z.string() }).strict(),
    preview: async () => ({ kind: "schedule_message", title: "Schedule", confirmLabel: "Send", fields: [] }),
    handler: async () => {
      executed += 1;
      return { reply: "scheduled" };
    },
  }),
]);

function proposedRow(portal: string): Row {
  return {
    id: ACTION_ID,
    user_id: ACTOR,
    portal,
    tool_name: "schedule_message",
    input: { body: "hi" },
    status: "proposed",
    session_id: null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };
}

describe("confirm gate portal binding", () => {
  it("executes a proposal made in the SAME portal", async () => {
    executed = 0;
    const rows = [proposedRow("manager")];
    const ctx = { userId: ACTOR, db: makeDb(rows) };
    const result = await runConfirmedPendingActionForPortal(ctx, registry, "manager", ACTION_ID);
    expect(result.ok).toBe(true);
    expect(executed).toBe(1);
    expect(rows[0]!.status).toBe("executed");
  });

  it("refuses a resident-portal proposal confirmed through the manager portal", async () => {
    executed = 0;
    const rows = [proposedRow("resident")];
    const ctx = { userId: ACTOR, db: makeDb(rows) };
    const result = await runConfirmedPendingActionForPortal(ctx, registry, "manager", ACTION_ID);
    expect(result.ok).toBe(false);
    expect(executed).toBe(0);
    // The claim already burned the row; it is recorded as failed, never executed,
    // so a retry must go through a fresh proposal in the right portal.
    expect(rows[0]!.status).toBe("failed");
  });

  it("refuses another actor's proposal outright", async () => {
    executed = 0;
    const rows = [proposedRow("manager")];
    const ctx = { userId: "user_b", db: makeDb(rows) };
    const result = await runConfirmedPendingActionForPortal(ctx, registry, "manager", ACTION_ID);
    expect(result.ok).toBe(false);
    expect(executed).toBe(0);
    expect(rows[0]!.status).toBe("proposed");
  });
});
