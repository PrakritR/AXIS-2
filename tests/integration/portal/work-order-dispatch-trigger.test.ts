import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonRequest, parseJsonResponse } from "../../helpers/api-request";

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createSupabaseServiceRoleClient: vi.fn() }));
vi.mock("@/lib/auth/admin-preview", () => ({ isAdminUser: vi.fn().mockResolvedValue(false) }));
vi.mock("@/lib/work-order-dispatch.server", () => ({ prepareDispatch: vi.fn().mockResolvedValue(undefined) }));

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { prepareDispatch } from "@/lib/work-order-dispatch.server";
import { POST } from "@/app/api/portal-work-orders/route";

type Rec = {
  id: string;
  manager_user_id: string | null;
  resident_email: string | null;
  row_data: Record<string, unknown>;
};

/** Same shape as the sibling portal-work-orders mock, plus emulation of the
 * `dispatch:row_data->dispatch` aliased selection the ownership lookup uses. */
function mockDb(seed: Rec[], profile: { email: string; role: string } | null, appSeed: { manager_user_id: string; resident_email: string }[] = []) {
  const store = new Map(seed.map((r) => [r.id, r]));
  const upserts: Rec[] = [];

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
          limit: async () => ({
            data: appSeed
              .filter((a) => a.manager_user_id === filters.manager_user_id && a.resident_email === filters.resident_email)
              .map((_, i) => ({ id: `APP-${i}` })),
            error: null,
          }),
        };
        return builder;
      }
      if (table === "manager_vendor_records") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          }),
        };
      }
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (_col: string, val: string) => ({
          maybeSingle: async () => {
            const rec = store.get(val);
            if (!rec) return { data: null, error: null };
            return {
              data: {
                manager_user_id: rec.manager_user_id,
                resident_email: rec.resident_email,
                dispatch: (rec.row_data as { dispatch?: unknown }).dispatch ?? null,
              },
              error: null,
            };
          },
        }),
        upsert: async (rec: Rec) => {
          upserts.push(rec);
          store.set(rec.id, rec);
          return { error: null };
        },
      };
      return chain;
    },
  };
  return { client, store, upserts };
}

function asUser(id: string, email: string) {
  vi.mocked(createSupabaseServerClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id, email, user_metadata: {} } } }) },
  } as never);
}

const PROPOSAL = {
  status: "proposed",
  vendorId: "v1",
  vendorName: "Pipes R Us",
  reasoning: "r",
  candidates: [],
  guardrails: { approvedList: true, category: true, spendCap: "no_estimate" },
  proposedAtIso: "2026-07-15T00:00:00.000Z",
};

describe("work-order POST dispatch trigger + preserve", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fires prepareDispatch exactly once for a new resident row, not on re-sync", async () => {
    asUser("res-b", "res@b.com");
    const { client } = mockDb([], { email: "res@b.com", role: "resident" }, [
      { manager_user_id: "mgr-b", resident_email: "res@b.com" },
    ]);
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(client as never);

    const body = { action: "replace", rows: [{ id: "REQ-new", managerUserId: "mgr-b", residentEmail: "res@b.com" }] };
    const first = await POST(jsonRequest("http://t", { method: "POST", body }));
    expect((await parseJsonResponse(first)).status).toBe(200);
    expect(vi.mocked(prepareDispatch)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prepareDispatch)).toHaveBeenCalledWith(expect.anything(), "REQ-new");

    const replay = await POST(jsonRequest("http://t", { method: "POST", body }));
    expect((await parseJsonResponse(replay)).status).toBe(200);
    expect(vi.mocked(prepareDispatch)).toHaveBeenCalledTimes(1);
  });

  it("does not fire for manager-created rows", async () => {
    asUser("mgr-a", "a@test.com");
    const { client } = mockDb([], { email: "a@test.com", role: "manager" });
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(client as never);

    const res = await POST(jsonRequest("http://t", { method: "POST", body: { row: { id: "WO-mgr", title: "x" } } }));
    expect((await parseJsonResponse(res)).status).toBe(200);
    expect(vi.mocked(prepareDispatch)).not.toHaveBeenCalled();
  });

  it("preserves a server-side dispatch proposal when a client re-sync omits it", async () => {
    asUser("mgr-a", "a@test.com");
    const { client, upserts } = mockDb(
      [
        {
          id: "WO-a",
          manager_user_id: "mgr-a",
          resident_email: "res@a.com",
          row_data: { id: "WO-a", title: "A", dispatch: PROPOSAL },
        },
      ],
      { email: "a@test.com", role: "manager" },
    );
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(client as never);

    const res = await POST(
      jsonRequest("http://t", { method: "POST", body: { action: "replace", rows: [{ id: "WO-a", title: "A edited" }] } }),
    );
    expect((await parseJsonResponse(res)).status).toBe(200);
    const persisted = upserts[0]!.row_data as { title: string; dispatch?: { status: string } };
    expect(persisted.title).toBe("A edited");
    expect(persisted.dispatch?.status).toBe("proposed");
  });

  it("never lets an undecided client echo overwrite a decided dispatch", async () => {
    asUser("mgr-a", "a@test.com");
    const decided = { ...PROPOSAL, status: "approved", decidedAtIso: "2026-07-15T01:00:00.000Z", decidedBy: "manager" };
    const { client, upserts } = mockDb(
      [{ id: "WO-a", manager_user_id: "mgr-a", resident_email: null, row_data: { id: "WO-a", title: "A", dispatch: decided } }],
      { email: "a@test.com", role: "manager" },
    );
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(client as never);

    const res = await POST(
      jsonRequest("http://t", {
        method: "POST",
        body: { row: { id: "WO-a", title: "A", dispatch: PROPOSAL } },
      }),
    );
    expect((await parseJsonResponse(res)).status).toBe(200);
    const persisted = upserts[0]!.row_data as { dispatch?: { status: string } };
    expect(persisted.dispatch?.status).toBe("approved");
  });
});
