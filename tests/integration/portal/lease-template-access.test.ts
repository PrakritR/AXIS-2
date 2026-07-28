import { beforeEach, describe, expect, it, vi } from "vitest";

// The route resolves the caller itself (it must judge a multi-role account on
// each relationship it holds, not on one preferred portal role), so the session
// and the co-manager/resident scope resolvers are mocked and the route's own
// authorization logic is what runs.
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createSupabaseServiceRoleClient: vi.fn() }));
vi.mock("@/lib/auth/co-manager-module-scope", () => ({ linkedPropertyIdsForModule: vi.fn() }));
vi.mock("@/lib/resident-manager-scope", () => ({ resolveResidentFilingScope: vi.fn() }));
vi.mock("@/lib/reports/auth", () => ({ getReportsAuthContext: vi.fn() }));

import { linkedPropertyIdsForModule } from "@/lib/auth/co-manager-module-scope";
import { leaseTemplateUrlForPath } from "@/lib/lease-template-storage";
import { resolveResidentFilingScope } from "@/lib/resident-manager-scope";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { GET, DELETE } from "@/app/api/portal/lease-template/route";

const OWNER = "b5809cf3-dcff-4e46-a0cc-5dcc53bc8910";
const OTHER = "f707ad54-3d2f-4217-804d-3de84e7b61ef";
const PATH = `${OWNER}/1753000000000-ab12cd.pdf`;
const PDF = Buffer.from("%PDF-1.7 lease");

/** The listing whose submission references the template under test. */
const PROPERTY_ROW = {
  property_data: { listingSubmission: { leaseTemplateDocUrl: leaseTemplateUrlForPath(PATH) } },
};

function mockDb(propertyRows: unknown[] = [PROPERTY_ROW]) {
  const removed: string[][] = [];
  const downloaded: string[] = [];
  return {
    removed,
    downloaded,
    client: {
      from: (table: string) => {
        if (table === "profiles") {
          return {
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { email: "r@example.com" } }) }) }),
          };
        }
        return { select: () => ({ in: async () => ({ data: propertyRows }) }) };
      },
      storage: {
        from: () => ({
          download: async (path: string) => {
            downloaded.push(path);
            return { data: new Blob([PDF]), error: null };
          },
          remove: async (paths: string[]) => {
            removed.push(paths);
            return { error: null };
          },
        }),
      },
    },
  };
}

function signedInAs(userId: string | null) {
  vi.mocked(createSupabaseServerClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: userId ? { id: userId, email: "r@example.com" } : null } }) },
  } as never);
}

function get(path: string): Promise<Response> {
  return GET(new Request(`http://localhost/api/portal/lease-template?path=${encodeURIComponent(path)}`));
}

describe("GET /api/portal/lease-template", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(linkedPropertyIdsForModule).mockResolvedValue(new Set());
    vi.mocked(resolveResidentFilingScope).mockResolvedValue(null);
  });

  it("denies an anonymous caller", async () => {
    signedInAs(null);
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockDb().client as never);
    expect((await get(PATH)).status).toBe(404);
  });

  it("serves the owning manager", async () => {
    signedInAs(OWNER);
    const db = mockDb();
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(db.client as never);

    const res = await get(PATH);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(db.downloaded).toEqual([PATH]);
  });

  it("serves the resident whose linked property references the template", async () => {
    signedInAs(OTHER);
    vi.mocked(resolveResidentFilingScope).mockResolvedValue({ managerUserId: OWNER, propertyId: "mgr-1" });
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockDb().client as never);

    expect((await get(PATH)).status).toBe(200);
  });

  it("denies a resident whose property does NOT reference the template", async () => {
    signedInAs(OTHER);
    vi.mocked(resolveResidentFilingScope).mockResolvedValue({ managerUserId: OWNER, propertyId: "mgr-2" });
    // Their property points at a different object.
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(
      mockDb([{ property_data: { listingSubmission: { leaseTemplateDocUrl: leaseTemplateUrlForPath(`${OWNER}/other.pdf`) } } }])
        .client as never,
    );

    expect((await get(PATH)).status).toBe(404);
  });

  it("denies a different manager with no relationship to the property", async () => {
    signedInAs(OTHER);
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockDb([]).client as never);
    expect((await get(PATH)).status).toBe(404);
  });

  it("serves a co-manager assigned the property that references it", async () => {
    signedInAs(OTHER);
    vi.mocked(linkedPropertyIdsForModule).mockResolvedValue(new Set(["mgr-1"]));
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(mockDb().client as never);
    expect((await get(PATH)).status).toBe(200);
  });

  it("rejects a traversal path before touching storage", async () => {
    signedInAs(OWNER);
    const db = mockDb();
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(db.client as never);

    expect((await get(`${OWNER}/../../other/lease.pdf`)).status).toBe(404);
    expect(db.downloaded).toEqual([]);
  });
});

describe("DELETE /api/portal/lease-template", () => {
  beforeEach(() => vi.clearAllMocks());

  it("removes only paths inside the caller's own folder", async () => {
    signedInAs(OWNER);
    const db = mockDb();
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(db.client as never);

    const res = await DELETE(
      new Request("http://localhost/api/portal/lease-template", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: [PATH, `${OTHER}/victim.pdf`] }),
      }),
    );

    expect(res.status).toBe(200);
    expect(db.removed).toEqual([[PATH]]);
  });
});
