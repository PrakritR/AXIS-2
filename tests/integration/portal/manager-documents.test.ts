import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonRequest, parseJsonResponse } from "../../helpers/api-request";

// The document routes gate on getReportsAuthContext + assertManagerFinancialsAccess.
// We mock the auth layer directly so the tests exercise the routes' own
// ownership/validation logic rather than the auth internals.
vi.mock("@/lib/reports/auth", () => ({
  getReportsAuthContext: vi.fn(),
  assertManagerFinancialsAccess: vi.fn(),
}));
vi.mock("@/lib/analytics/posthog", () => ({ track: vi.fn() }));

import { getReportsAuthContext, assertManagerFinancialsAccess } from "@/lib/reports/auth";
import { GET as LIST, POST as UPLOAD } from "@/app/api/manager-documents/route";
import { PATCH as RENAME, DELETE as SOFT_DELETE } from "@/app/api/manager-documents/[id]/route";
import { GET as SIGNED_URL } from "@/app/api/manager-documents/[id]/signed-url/route";

type DocRow = {
  id: string;
  manager_user_id: string;
  storage_path: string;
  display_name: string;
  mime_type: string;
  deleted_at: string | null;
};

/**
 * A minimal Supabase-shaped mock. `manager_documents` queries chain
 * .eq("manager_user_id", ...) — the mock records which owner was requested and
 * only returns rows whose manager_user_id matches, mirroring how the real
 * WHERE clause scopes ownership.
 */
function mockDb(rows: DocRow[]) {
  const removed: string[][] = [];
  const signed: { path: string }[] = [];
  const inserted: Record<string, unknown>[] = [];

  function tableApi() {
    const filters: Record<string, unknown> = {};
    const builder: Record<string, unknown> = {
      select: () => builder,
      order: () => builder,
      limit: () => builder,
      is: (col: string, val: unknown) => {
        filters[col] = val;
        return builder;
      },
      not: () => builder,
      ilike: () => builder,
      eq: (col: string, val: unknown) => {
        filters[col] = val;
        return builder;
      },
      insert: (row: Record<string, unknown>) => {
        inserted.push(row);
        return {
          select: () => ({
            single: async () => ({
              data: { ...row, id: "new-doc", created_at: "2026-07-07T00:00:00Z", updated_at: "2026-07-07T00:00:00Z", visibility: "manager", expires_at: null, superseded_by_document_id: null },
              error: null,
            }),
          }),
        };
      },
      update: (patch: Record<string, unknown>) => {
        const upd: Record<string, unknown> = {};
        const updBuilder: Record<string, unknown> = {
          eq: (col: string, val: unknown) => {
            upd[col] = val;
            return updBuilder;
          },
          is: (col: string, val: unknown) => {
            upd[col] = val;
            return updBuilder;
          },
          select: () => ({
            maybeSingle: async () => {
              const match = rows.find(
                (r) => r.id === upd.id && r.manager_user_id === upd.manager_user_id && r.deleted_at === null,
              );
              if (!match) return { data: null, error: null };
              Object.assign(match, patch);
              return {
                data: { ...match, original_filename: null, size_bytes: 10, checksum: null, category: "other", property_id: null, unit_label: null, lease_id: null, resident_user_id: null, resident_email: null, vendor_id: null, work_order_id: null, visibility: "manager", expires_at: null, superseded_by_document_id: null, uploaded_by: match.manager_user_id, created_at: "x", updated_at: "y" },
                error: null,
              };
            },
          }),
        };
        return updBuilder;
      },
      // Terminal for the signed-url SELECT: .eq().eq().is().maybeSingle()
      maybeSingle: async () => {
        const match = rows.find(
          (r) => r.id === filters.id && r.manager_user_id === filters.manager_user_id && r.deleted_at === null,
        );
        return { data: match ?? null, error: null };
      },
      // Terminal for the list SELECT (awaited directly)
      then: (resolve: (v: { data: DocRow[]; error: null }) => void) => {
        const data = rows.filter((r) => r.manager_user_id === filters.manager_user_id && r.deleted_at === null);
        resolve({ data, error: null });
      },
    };
    return builder;
  }

  const client = {
    from: () => tableApi(),
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        remove: async (paths: string[]) => {
          removed.push(paths);
          return { error: null };
        },
        createSignedUrl: async (path: string) => {
          signed.push({ path });
          return { data: { signedUrl: `https://signed.example/${path}` }, error: null };
        },
      }),
    },
  };
  return { client, removed, signed, inserted };
}

function asManager(userId: string, client: unknown) {
  vi.mocked(getReportsAuthContext).mockResolvedValue({
    role: "manager",
    userId,
    email: "m@test.com",
    db: client as never,
  } as never);
  vi.mocked(assertManagerFinancialsAccess).mockResolvedValue({ ok: true });
}

describe("manager-documents API ownership", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects an unauthenticated signed-url request with 401", async () => {
    vi.mocked(getReportsAuthContext).mockResolvedValue(null);
    const res = await SIGNED_URL(jsonRequest("http://t/api/manager-documents/doc-1/signed-url"), {
      params: Promise.resolve({ id: "doc-1" }),
    });
    const { status } = await parseJsonResponse(res);
    expect(status).toBe(401);
  });

  it("returns 404 (not another manager's URL) when the doc belongs to a different manager", async () => {
    const rows: DocRow[] = [
      { id: "doc-1", manager_user_id: "mgr-owner", storage_path: "manager/mgr-owner/a.pdf", display_name: "A", mime_type: "application/pdf", deleted_at: null },
    ];
    const { client, signed } = mockDb(rows);
    asManager("mgr-intruder", client); // different manager

    const res = await SIGNED_URL(jsonRequest("http://t/api/manager-documents/doc-1/signed-url"), {
      params: Promise.resolve({ id: "doc-1" }),
    });
    const { status, data } = await parseJsonResponse<{ error?: string }>(res);
    expect(status).toBe(404);
    expect(data.error).toBeTruthy();
    // Never minted a signed URL for someone else's object.
    expect(signed).toHaveLength(0);
  });

  it("mints a signed URL for the owning manager", async () => {
    const rows: DocRow[] = [
      { id: "doc-1", manager_user_id: "mgr-owner", storage_path: "manager/mgr-owner/a.pdf", display_name: "A", mime_type: "application/pdf", deleted_at: null },
    ];
    const { client, signed } = mockDb(rows);
    asManager("mgr-owner", client);

    const res = await SIGNED_URL(jsonRequest("http://t/api/manager-documents/doc-1/signed-url"), {
      params: Promise.resolve({ id: "doc-1" }),
    });
    const { status, data } = await parseJsonResponse<{ url?: string }>(res);
    expect(status).toBe(200);
    expect(data.url).toContain("manager/mgr-owner/a.pdf");
    expect(signed).toHaveLength(1);
  });

  it("rename returns 404 for a mismatched manager and leaves the row untouched", async () => {
    const rows: DocRow[] = [
      { id: "doc-1", manager_user_id: "mgr-owner", storage_path: "p", display_name: "Original", mime_type: "application/pdf", deleted_at: null },
    ];
    const { client } = mockDb(rows);
    asManager("mgr-intruder", client);

    const res = await RENAME(
      jsonRequest("http://t/api/manager-documents/doc-1", { method: "PATCH", body: { displayName: "Hacked" } }),
      { params: Promise.resolve({ id: "doc-1" }) },
    );
    const { status } = await parseJsonResponse(res);
    expect(status).toBe(404);
    expect(rows[0]!.display_name).toBe("Original");
  });

  it("rename succeeds for the owning manager", async () => {
    const rows: DocRow[] = [
      { id: "doc-1", manager_user_id: "mgr-owner", storage_path: "p", display_name: "Original", mime_type: "application/pdf", deleted_at: null },
    ];
    const { client } = mockDb(rows);
    asManager("mgr-owner", client);

    const res = await RENAME(
      jsonRequest("http://t/api/manager-documents/doc-1", { method: "PATCH", body: { displayName: "Renamed" } }),
      { params: Promise.resolve({ id: "doc-1" }) },
    );
    const { status } = await parseJsonResponse(res);
    expect(status).toBe(200);
    expect(rows[0]!.display_name).toBe("Renamed");
  });

  it("soft-delete returns 404 for a mismatched manager and does not delete", async () => {
    const rows: DocRow[] = [
      { id: "doc-1", manager_user_id: "mgr-owner", storage_path: "p", display_name: "A", mime_type: "application/pdf", deleted_at: null },
    ];
    const { client } = mockDb(rows);
    asManager("mgr-intruder", client);

    const res = await SOFT_DELETE(jsonRequest("http://t/api/manager-documents/doc-1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "doc-1" }),
    });
    const { status } = await parseJsonResponse(res);
    expect(status).toBe(404);
    expect(rows[0]!.deleted_at).toBeNull();
  });

  it("soft-delete sets deleted_at for the owning manager", async () => {
    const rows: DocRow[] = [
      { id: "doc-1", manager_user_id: "mgr-owner", storage_path: "p", display_name: "A", mime_type: "application/pdf", deleted_at: null },
    ];
    const { client } = mockDb(rows);
    asManager("mgr-owner", client);

    const res = await SOFT_DELETE(jsonRequest("http://t/api/manager-documents/doc-1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "doc-1" }),
    });
    const { status } = await parseJsonResponse(res);
    expect(status).toBe(200);
    expect(rows[0]!.deleted_at).not.toBeNull();
  });

  it("list only returns the requesting manager's own live documents", async () => {
    const rows: DocRow[] = [
      { id: "doc-1", manager_user_id: "mgr-a", storage_path: "p1", display_name: "Mine", mime_type: "application/pdf", deleted_at: null },
      { id: "doc-2", manager_user_id: "mgr-b", storage_path: "p2", display_name: "Theirs", mime_type: "application/pdf", deleted_at: null },
      { id: "doc-3", manager_user_id: "mgr-a", storage_path: "p3", display_name: "Deleted", mime_type: "application/pdf", deleted_at: "2026-01-01T00:00:00Z" },
    ];
    const { client } = mockDb(rows);
    asManager("mgr-a", client);

    const res = await LIST(jsonRequest("http://t/api/manager-documents"));
    const { status, data } = await parseJsonResponse<{ documents: { displayName: string }[] }>(res);
    expect(status).toBe(200);
    expect(data.documents.map((d) => d.displayName)).toEqual(["Mine"]);
  });

  it("upload rejects a disallowed mime type with 415 and never inserts", async () => {
    const { client, inserted } = mockDb([]);
    asManager("mgr-a", client);

    const form = new FormData();
    form.set("file", new File([new Uint8Array([1, 2, 3])], "evil.exe", { type: "application/x-msdownload" }));
    const req = new Request("http://t/api/manager-documents", { method: "POST", body: form });

    const res = await UPLOAD(req);
    const { status } = await parseJsonResponse(res);
    expect(status).toBe(415);
    expect(inserted).toHaveLength(0);
  });

  it("upload stores an owned row with manager_user_id from auth, not the client", async () => {
    const { client, inserted } = mockDb([]);
    asManager("mgr-a", client);

    const form = new FormData();
    form.set("file", new File([new Uint8Array([1, 2, 3, 4])], "lease.pdf", { type: "application/pdf" }));
    form.set("category", "lease");
    // A malicious client tries to attribute the doc to another manager — ignored.
    form.set("managerUserId", "mgr-victim");
    const req = new Request("http://t/api/manager-documents", { method: "POST", body: form });

    const res = await UPLOAD(req);
    const { status } = await parseJsonResponse(res);
    expect(status).toBe(201);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]!.manager_user_id).toBe("mgr-a");
    expect(inserted[0]!.uploaded_by).toBe("mgr-a");
    expect(inserted[0]!.category).toBe("lease");
    expect(String(inserted[0]!.storage_path)).toContain("manager/mgr-a/");
  });
});
