import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonRequest, parseJsonResponse } from "../../helpers/api-request";

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createSupabaseServiceRoleClient: vi.fn() }));
vi.mock("@/lib/auth/admin-preview", () => ({ isAdminUser: vi.fn().mockResolvedValue(false) }));

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { GET, POST } from "@/app/api/portal-work-orders/route";

type Rec = { id: string; manager_user_id: string | null; resident_email: string | null; row_data: unknown };
type AppRec = { id: string; manager_user_id: string; resident_email: string };

function mockDb(seed: Rec[], profile: { email: string; role: string } | null, appSeed: AppRec[] = []) {
  const store = new Map(seed.map((r) => [r.id, r]));
  const upserts: Rec[] = [];
  const deletes: string[] = [];
  let lastOr: string | null = null;
  let lastResidentEq: string | null = null;

  const listResult = () => {
    // Emulate the GET scoping the route applies via .or / .eq.
    let rows = [...store.values()];
    if (lastResidentEq != null) rows = rows.filter((r) => r.resident_email === lastResidentEq);
    if (lastOr != null) {
      const m = /manager_user_id\.eq\.([^,]+),manager_user_id\.is\.null/.exec(lastOr);
      const owner = m?.[1];
      rows = rows.filter((r) => r.manager_user_id === owner || r.manager_user_id == null);
    }
    return { data: rows.map((r) => ({ row_data: r.row_data, updated_at: "x" })), error: null };
  };

  const client = {
    from(table: string) {
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: profile }),
        };
      }
      if (table === "manager_application_records") {
        const filters: Record<string, string> = {};
        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: (col: string, val: string) => {
            filters[col] = val;
            return builder;
          },
          limit: async () => {
            const rows = appSeed.filter(
              (a) => a.manager_user_id === filters.manager_user_id && a.resident_email === filters.resident_email,
            );
            return { data: rows.map((a) => ({ id: a.id })), error: null };
          },
        };
        return builder;
      }
      // portal_work_order_records — GET uses select/order/limit/(or|eq); POST uses select/eq/maybeSingle, upsert, delete/eq.
      const chain: Record<string, unknown> = {
        select: () => chain,
        order: () => chain,
        limit: () => chain,
        or: (expr: string) => {
          lastOr = expr;
          return listResult();
        },
        eq: (col: string, val: string) => {
          if (col === "resident_email") {
            lastResidentEq = val;
            return listResult();
          }
          // POST ownership lookup: .select(...).eq("id", id).maybeSingle()
          return { maybeSingle: async () => ({ data: store.get(val) ?? null, error: null }) };
        },
        upsert: async (rec: Rec) => {
          upserts.push(rec);
          store.set(rec.id, rec);
          return { error: null };
        },
        delete: () => ({
          eq: async (_col: string, id: string) => {
            deletes.push(id);
            store.delete(id);
            return { error: null };
          },
        }),
      };
      return chain;
    },
  };
  return { client, upserts, deletes };
}

function asUser(id: string | null, email = "") {
  vi.mocked(createSupabaseServerClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: id ? { id, email, user_metadata: {} } : null } }),
    },
  } as never);
}

const SEED: Rec[] = [
  { id: "WO-a", manager_user_id: "mgr-a", resident_email: "res@a.com", row_data: { id: "WO-a", title: "A" } },
  { id: "WO-b", manager_user_id: "mgr-b", resident_email: "res@b.com", row_data: { id: "WO-b", title: "B" } },
  { id: "WO-legacy", manager_user_id: null, resident_email: null, row_data: { id: "WO-legacy", title: "L" } },
];

describe("/api/portal-work-orders security", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GET scopes a manager to their own (+ legacy) work orders, not other landlords'", async () => {
    asUser("mgr-a", "a@test.com");
    const { client } = mockDb(SEED, { email: "a@test.com", role: "manager" });
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(client as never);

    const res = await GET();
    const { status, data } = await parseJsonResponse<{ rows: { id: string }[] }>(res);
    expect(status).toBe(200);
    const ids = data.rows.map((r) => r.id).sort();
    expect(ids).toEqual(["WO-a", "WO-legacy"]);
    expect(ids).not.toContain("WO-b");
  });

  it("POST requires authentication", async () => {
    asUser(null);
    const { client, upserts } = mockDb(SEED, null);
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(client as never);

    const res = await POST(jsonRequest("http://t", { method: "POST", body: { row: { id: "WO-x", managerUserId: "mgr-a" } } }));
    const { status } = await parseJsonResponse(res);
    expect(status).toBe(401);
    expect(upserts).toHaveLength(0);
  });

  it("rejects a manager deleting another landlord's work order (IDOR)", async () => {
    asUser("mgr-a", "a@test.com");
    const { client, deletes } = mockDb(SEED, { email: "a@test.com", role: "manager" });
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(client as never);

    const res = await POST(jsonRequest("http://t", { method: "POST", body: { action: "delete", id: "WO-b" } }));
    const { status } = await parseJsonResponse(res);
    expect(status).toBe(403);
    expect(deletes).toHaveLength(0);
  });

  it("pins manager_user_id to the session on upsert (no spoofing)", async () => {
    asUser("mgr-a", "a@test.com");
    const { client, upserts } = mockDb([], { email: "a@test.com", role: "manager" });
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(client as never);

    const res = await POST(
      jsonRequest("http://t", { method: "POST", body: { row: { id: "WO-new", managerUserId: "mgr-victim", residentEmail: "r@x.com" } } }),
    );
    const { status } = await parseJsonResponse(res);
    expect(status).toBe(200);
    expect(upserts[0]!.manager_user_id).toBe("mgr-a");
  });

  it("rejects a resident filing a work order into an unrelated manager's queue (injection)", async () => {
    asUser("res-b", "res@b.com");
    // res@b.com belongs to mgr-b; they try to inject into mgr-a's queue.
    const { client, upserts } = mockDb([], { email: "res@b.com", role: "resident" }, [
      { id: "APP-1", manager_user_id: "mgr-b", resident_email: "res@b.com" },
    ]);
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(client as never);

    const res = await POST(
      jsonRequest("http://t", {
        method: "POST",
        body: { row: { id: "WO-evil", managerUserId: "mgr-a", residentEmail: "res@b.com" } },
      }),
    );
    const { status } = await parseJsonResponse(res);
    expect(status).toBe(403);
    expect(upserts).toHaveLength(0);
  });

  it("lets a resident file a work order with their real manager", async () => {
    asUser("res-b", "res@b.com");
    const { client, upserts } = mockDb([], { email: "res@b.com", role: "resident" }, [
      { id: "APP-1", manager_user_id: "mgr-b", resident_email: "res@b.com" },
    ]);
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(client as never);

    const res = await POST(
      jsonRequest("http://t", {
        method: "POST",
        body: { row: { id: "WO-ok", managerUserId: "mgr-b", residentEmail: "res@b.com" } },
      }),
    );
    const { status } = await parseJsonResponse(res);
    expect(status).toBe(200);
    expect(upserts[0]!.manager_user_id).toBe("mgr-b");
    expect(upserts[0]!.resident_email).toBe("res@b.com");
  });

  it("lets a manager claim a legacy unassigned work order but not overwrite a foreign one", async () => {
    asUser("mgr-a", "a@test.com");
    const { client, upserts } = mockDb(SEED, { email: "a@test.com", role: "manager" });
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(client as never);

    const claim = await POST(jsonRequest("http://t", { method: "POST", body: { row: { id: "WO-legacy", title: "L2" } } }));
    expect((await parseJsonResponse(claim)).status).toBe(200);
    expect(upserts.at(-1)!.manager_user_id).toBe("mgr-a");

    const foreign = await POST(jsonRequest("http://t", { method: "POST", body: { row: { id: "WO-b", title: "hijack" } } }));
    expect((await parseJsonResponse(foreign)).status).toBe(403);
  });
});
