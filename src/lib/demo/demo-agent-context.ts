import "server-only";
import type { AgentContext } from "@/lib/tools/context";
import {
  DEMO_MANAGER_EMAIL,
  DEMO_MANAGER_USER_ID,
} from "@/lib/demo/demo-session";
import {
  demoApplications,
  demoCharges,
  demoLeases,
  demoManagerInbox,
  demoProperties,
  demoServiceRequests,
  demoVendors,
  demoWorkOrders,
} from "@/lib/demo/demo-data";

type Row = Record<string, unknown>;

/**
 * In-memory, read-only tables that mirror what the demo panels show. Keyed by
 * the real portal table names each tool queries, and shaped exactly like the
 * `row_data` projections the tools expect. Built once per request.
 */
function demoTables(): Record<string, Row[]> {
  const wrap = <T extends { id: string }>(rows: T[]): Row[] =>
    rows.map((r) => ({ id: r.id, manager_user_id: DEMO_MANAGER_USER_ID, row_data: r }));
  const props = demoProperties();
  return {
    portal_household_charge_records: wrap(demoCharges()),
    portal_lease_pipeline_records: wrap(demoLeases()),
    portal_work_order_records: wrap(demoWorkOrders()),
    manager_application_records: wrap(demoApplications()),
    manager_vendor_records: wrap(demoVendors()),
    portal_service_request_records: wrap(demoServiceRequests()),
    portal_inbox_thread_records: wrap(demoManagerInbox()),
    portal_schedule_records: [],
    manager_property_records: props.map((p) => ({
      id: p.id,
      manager_user_id: DEMO_MANAGER_USER_ID,
      status: "live",
      row_data: p,
      property_data: p,
    })),
  };
}

/**
 * A minimal stand-in for the Supabase query builder. Every fluent method
 * (`select`, `eq`, `order`, `range`, `limit`, `gte`, …) is a no-op that returns
 * the same thenable, and awaiting it resolves the pre-scoped rows for the bound
 * table. Filters are ignored because the demo tables are already the only data
 * that exists — there is no real database and nothing to leak. Writes never
 * happen: the agent loop is read-only and the demo route omits the confirm path.
 */
function makeQuery(rows: Row[]): unknown {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: (value: { data: Row[]; error: null }) => unknown) =>
            resolve({ data: rows, error: null });
        }
        // Any builder method just returns the same thenable proxy.
        return () => proxy;
      },
    },
  );
  return proxy;
}

function makeStubDb(): AgentContext["db"] {
  const tables = demoTables();
  const db = {
    from(table: string) {
      return makeQuery(tables[table] ?? []);
    },
  };
  return db as unknown as AgentContext["db"];
}

/** A fixed, sandboxed agent context backed by fictional demo data (no real DB). */
export function buildDemoAgentContext(): AgentContext {
  return {
    landlordId: DEMO_MANAGER_USER_ID,
    userId: DEMO_MANAGER_USER_ID,
    email: DEMO_MANAGER_EMAIL,
    roles: ["manager"],
    isAdmin: false,
    db: makeStubDb(),
  };
}
