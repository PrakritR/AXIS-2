import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonRequest, parseJsonResponse } from "../../helpers/api-request";

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createSupabaseServiceRoleClient: vi.fn() }));
vi.mock("@/lib/auth/admin-preview", () => ({ isAdminUser: vi.fn().mockResolvedValue(false) }));

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { POST } from "@/app/api/portal-service-requests/route";

type Rec = { id: string; manager_user_id: string | null; resident_email: string | null; row_data: unknown };
type AppRec = { id: string; manager_user_id: string; resident_email: string };

/**
 * In-memory stand-in for the service-role client, seeded with one request owned
 * by manager "mgr-a" / resident "res@a.com". Captures upserts and deletes so the
 * ownership-gating behavior can be asserted. `appSeed` seeds the
 * `manager_application_records` table that backs the resident->manager scope
 * check.
 */
function mockDb(seed: Rec[], profile: { email: string; role: string }, appSeed: AppRec[] = []) {
  const store = new Map(seed.map((r) => [r.id, r]));
  const upserts: Rec[] = [];
  const deletes: string[] = [];
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
      // portal_service_request_records
      return {
        select() {
          return {
            eq(_col: string, id: string) {
              return { maybeSingle: async () => ({ data: store.get(id) ?? null, error: null }) };
            },
          };
        },
        upsert: async (rec: Rec) => {
          upserts.push(rec);
          store.set(rec.id, rec);
          return { error: null };
        },
        delete() {
          return {
            eq: async (_col: string, id: string) => {
              deletes.push(id);
              store.delete(id);
              return { error: null };
            },
          };
        },
      };
    },
  };
  return { client, upserts, deletes };
}

function asUser(id: string, email: string) {
  vi.mocked(createSupabaseServerClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id, email, user_metadata: {} } } }) },
  } as never);
}

const SEED: Rec[] = [
  { id: "SR-1", manager_user_id: "mgr-a", resident_email: "res@a.com", row_data: { id: "SR-1" } },
];

describe("/api/portal-service-requests POST ownership gating", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects deletion of a request the caller does not own (IDOR)", async () => {
    asUser("attacker", "evil@x.com");
    const { client, deletes } = mockDb(SEED, { email: "evil@x.com", role: "resident" });
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(client as never);

    const res = await POST(jsonRequest("http://t/api/portal-service-requests", { method: "POST", body: { action: "delete", id: "SR-1" } }));
    const { status } = await parseJsonResponse(res);
    expect(status).toBe(403);
    expect(deletes).toHaveLength(0);
  });

  it("allows the owning manager to delete their own request", async () => {
    asUser("mgr-a", "a@test.com");
    const { client, deletes } = mockDb(SEED, { email: "a@test.com", role: "manager" });
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(client as never);

    const res = await POST(jsonRequest("http://t/api/portal-service-requests", { method: "POST", body: { action: "delete", id: "SR-1" } }));
    const { status } = await parseJsonResponse(res);
    expect(status).toBe(200);
    expect(deletes).toEqual(["SR-1"]);
  });

  it("pins resident_email to the session on a resident upsert (no spoofing)", async () => {
    asUser("res-b", "res@b.com");
    const { client, upserts } = mockDb([], { email: "res@b.com", role: "resident" }, [
      { id: "APP-1", manager_user_id: "mgr-a", resident_email: "res@b.com" },
    ]);
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(client as never);

    const res = await POST(
      jsonRequest("http://t/api/portal-service-requests", {
        method: "POST",
        body: { row: { id: "SR-9", residentEmail: "victim@x.com", managerUserId: "mgr-a", status: "pending" } },
      }),
    );
    const { status } = await parseJsonResponse(res);
    expect(status).toBe(200);
    expect(upserts[0]!.resident_email).toBe("res@b.com");
  });

  it("rejects a resident filing into a manager that does not have them as a resident (injection)", async () => {
    asUser("res-b", "res@b.com");
    // res@b.com belongs to mgr-b only; they try to inject into mgr-a's queue.
    const { client, upserts } = mockDb([], { email: "res@b.com", role: "resident" }, [
      { id: "APP-1", manager_user_id: "mgr-b", resident_email: "res@b.com" },
    ]);
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(client as never);

    const res = await POST(
      jsonRequest("http://t/api/portal-service-requests", {
        method: "POST",
        body: { row: { id: "SR-evil", residentEmail: "res@b.com", managerUserId: "mgr-a", status: "pending" } },
      }),
    );
    const { status } = await parseJsonResponse(res);
    expect(status).toBe(403);
    expect(upserts).toHaveLength(0);
  });

  it("pins manager_user_id to the session on a manager upsert (no spoofing)", async () => {
    asUser("mgr-real", "m@real.com");
    const { client, upserts } = mockDb([], { email: "m@real.com", role: "manager" });
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(client as never);

    const res = await POST(
      jsonRequest("http://t/api/portal-service-requests", {
        method: "POST",
        body: { row: { id: "SR-10", managerUserId: "mgr-victim", residentEmail: "r@x.com", status: "approved" } },
      }),
    );
    const { status } = await parseJsonResponse(res);
    expect(status).toBe(200);
    expect(upserts[0]!.manager_user_id).toBe("mgr-real");
  });
});
