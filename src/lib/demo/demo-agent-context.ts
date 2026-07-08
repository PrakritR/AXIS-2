import "server-only";
import type { AgentContext } from "@/lib/tools/context";
import {
  DEMO_MANAGER_EMAIL,
  DEMO_MANAGER_USER_ID,
} from "@/lib/demo/demo-session";
import { buildDemoIdleSnapshot } from "@/lib/demo/demo-guided-data";
import type { DemoDataSnapshot } from "@/lib/demo/demo-guided-data";

type Row = Record<string, unknown>;

function demoTablesFromSnapshot(snapshot: DemoDataSnapshot): Record<string, Row[]> {
  const wrap = <T extends { id: string }>(rows: T[]): Row[] =>
    rows.map((r) => ({ id: r.id, manager_user_id: DEMO_MANAGER_USER_ID, row_data: r }));
  return {
    portal_household_charge_records: wrap(snapshot.charges),
    portal_lease_pipeline_records: wrap(snapshot.leases),
    portal_work_order_records: wrap(snapshot.workOrders),
    manager_application_records: wrap(snapshot.applications),
    manager_vendor_records: wrap(snapshot.vendors),
    portal_service_request_records: wrap(snapshot.serviceRequests),
    portal_inbox_thread_records: wrap(snapshot.managerInbox),
    portal_schedule_records: wrap(snapshot.schedule.plannedEvents),
    manager_property_records: snapshot.properties.map((p) => ({
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
        return () => proxy;
      },
    },
  );
  return proxy;
}

function makeStubDb(snapshot: DemoDataSnapshot): AgentContext["db"] {
  const tables = demoTablesFromSnapshot(snapshot);
  const db = {
    from(table: string) {
      return makeQuery(tables[table] ?? []);
    },
  };
  return db as unknown as AgentContext["db"];
}

/** A fixed, sandboxed agent context backed by the same idle demo snapshot as the UI. */
export function buildDemoAgentContext(): AgentContext {
  const snapshot = buildDemoIdleSnapshot();
  return {
    landlordId: DEMO_MANAGER_USER_ID,
    userId: DEMO_MANAGER_USER_ID,
    email: DEMO_MANAGER_EMAIL,
    roles: ["manager"],
    isAdmin: false,
    db: makeStubDb(snapshot),
  };
}
