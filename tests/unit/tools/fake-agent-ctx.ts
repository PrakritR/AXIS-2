import type { AgentContext } from "@/lib/tools/context";

/**
 * A record as stored in a `portal_*` / `manager_*` table: the scope columns the
 * tool loaders filter on, plus the `row_data` JSON payload the UI persists.
 */
export type FakeRecord = {
  id?: string;
  manager_user_id?: string | null;
  scope?: string | null;
  owner_user_id?: string | null;
  resident_email?: string | null;
  property_id?: string | null;
  updated_at?: string | null;
  row_data: unknown;
};

/**
 * Minimal chainable stand-in for a supabase-js query builder. It records `.eq`
 * filters and applies them against the seeded rows, so a tool that forgets its
 * landlord scope would actually return another landlord's rows and fail the
 * test. The builder is awaitable (for `await query`) and exposes `.range` for
 * the paginated loader — mirroring how the real client is consumed.
 */
class FakeQuery {
  private filters: [string, unknown][] = [];
  constructor(private rows: FakeRecord[]) {}

  select() {
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push([col, val]);
    return this;
  }
  neq(col: string, val: unknown) {
    this.filters.push([`!${col}`, val]);
    return this;
  }
  gte(col: string, val: unknown) {
    this.filters.push([`>=${col}`, val]);
    return this;
  }
  lte(col: string, val: unknown) {
    this.filters.push([`<=${col}`, val]);
    return this;
  }

  private apply(): FakeRecord[] {
    return this.rows.filter((r) =>
      this.filters.every(([col, val]) => {
        const rec = r as Record<string, unknown>;
        if (col.startsWith("!")) return rec[col.slice(1)] !== val;
        if (col.startsWith(">=")) {
          const c = col.slice(2);
          return !(c in r) || String(rec[c] ?? "") >= String(val ?? "");
        }
        if (col.startsWith("<=")) {
          const c = col.slice(2);
          return !(c in r) || String(rec[c] ?? "") <= String(val ?? "");
        }
        // Unknown projected columns (e.g. JSON path filters) are not modeled.
        if (!(col in r)) return true;
        return rec[col] === val;
      }),
    );
  }

  range(from: number, to: number) {
    return Promise.resolve({ data: this.apply().slice(from, to + 1), error: null });
  }

  // Thenable: `await query` resolves to the filtered rows.
  then<T>(resolve: (v: { data: FakeRecord[]; error: null }) => T) {
    return Promise.resolve({ data: this.apply(), error: null }).then(resolve);
  }
}

/**
 * Build an AgentContext whose service-role db serves the given per-table rows.
 * Tables not seeded return an empty set. landlordId/userId default to
 * "manager_a" so tests can seed rows for that scope and a foreign scope.
 */
export function makeManagerRowsCtx(
  tables: Record<string, FakeRecord[]>,
  overrides: Partial<AgentContext> = {},
): AgentContext {
  const db = {
    from(table: string) {
      return new FakeQuery(tables[table] ?? []);
    },
  };
  return {
    landlordId: "manager_a",
    userId: "manager_a",
    email: "manager@axis.test",
    roles: ["manager"],
    isAdmin: false,
    db,
    ...overrides,
  } as unknown as AgentContext;
}

/** Wrap a row_data payload with its scope columns for a manager-scoped table. */
export function managerRow(managerUserId: string, rowData: unknown, id?: string): FakeRecord {
  return {
    id: id ?? (rowData as { id?: string })?.id ?? `row_${Math.random().toString(36).slice(2)}`,
    manager_user_id: managerUserId,
    row_data: rowData,
  };
}
