/**
 * The AUTHORITATIVE half of the signed-document guarantee.
 *
 * `preserveSignedLeaseDocuments` runs in the browser against a store the
 * browser owns, so it is advisory: anyone with devtools can POST straight at
 * the route. This suite drives the real route handler and fails if that server
 * check is removed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const state: {
  user: { id: string; email: string } | null;
  profile: { email: string; role: string };
  leases: Row[];
} = {
  user: { id: "11111111-2222-4333-8444-555555555555", email: "manager@axis.test" },
  profile: { email: "manager@axis.test", role: "manager" },
  leases: [],
};

/** Minimal PostgREST stand-in: enough for select/eq/limit/maybeSingle/upsert. */
function makeQuery(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  const rows = () => (table === "portal_lease_pipeline_records" ? state.leases : []);
  const matches = () => rows().filter((r) => filters.every((f) => f(r)));
  const q = {
    select: () => q,
    order: () => q,
    or: () => q,
    eq: (col: string, val: unknown) => {
      filters.push((r) => r[col] === val);
      return q;
    },
    limit: () => Promise.resolve({ data: matches(), error: null }),
    maybeSingle: () => Promise.resolve({ data: matches()[0] ?? null, error: null }),
    upsert: (payload: Row) => {
      const idx = state.leases.findIndex((r) => r.id === payload.id);
      if (idx === -1) state.leases.push({ ...payload });
      else state.leases[idx] = { ...payload };
      return Promise.resolve({ data: null, error: null });
    },
    delete: () => q,
  };
  return q;
}

const db = {
  from: (table: string) => {
    if (table === "profiles") {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.profile }) }) }),
      };
    }
    return makeQuery(table);
  },
};

vi.mock("@/lib/supabase/service", () => ({ createSupabaseServiceRoleClient: () => db }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } }),
}));
vi.mock("@/lib/auth/admin-preview", () => ({ isAdminUser: async () => false }));
vi.mock("@/lib/auth/manager-lease-scope", () => ({
  fetchLeasesForManagerUser: async () => [],
  managerCanAccessLeaseRecord: async () => true,
}));
vi.mock("@/lib/documents/document-auto-file-hooks.server", () => ({
  autoFileLeaseDocument: async () => undefined,
}));

import { POST } from "@/app/api/portal-lease-pipeline/route";

const EXECUTED_HTML = "<html><body>EXECUTED LEASE TEXT</body></html>";

function executedRow(overrides: Row = {}): Row {
  return {
    id: "lease_route_1",
    residentName: "Jordan Lee",
    residentEmail: "jordan.lee@example.com",
    managerUserId: state.user!.id,
    bucket: "signed",
    status: "Fully Signed",
    generatedHtml: EXECUTED_HTML,
    residentSignature: { role: "resident", name: "Jordan Lee", signedAtIso: "2026-07-01T00:00:00.000Z" },
    managerSignature: { role: "manager", name: "Pat Manager", signedAtIso: "2026-07-01T01:00:00.000Z" },
    fullySignedAt: "2026-07-01T01:00:00.000Z",
    ...overrides,
  };
}

function seedExecuted(row: Row = executedRow()) {
  state.leases = [
    {
      id: row.id,
      manager_user_id: state.user!.id,
      resident_email: row.residentEmail,
      property_id: null,
      status: "signed",
      row_data: row,
    },
  ];
}

function post(body: unknown) {
  return POST(new Request("http://localhost/api/portal-lease-pipeline", { method: "POST", body: JSON.stringify(body) }));
}

const storedRowData = () => state.leases[0]!.row_data as Row;

describe("POST /api/portal-lease-pipeline — signed documents are immutable server-side", () => {
  beforeEach(() => {
    state.user = { id: "11111111-2222-4333-8444-555555555555", email: "manager@axis.test" };
    state.profile = { email: "manager@axis.test", role: "manager" };
    seedExecuted();
  });

  it("refuses to replace the document body of a signed lease", async () => {
    const res = await post({
      action: "upsert",
      row: executedRow({ generatedHtml: "<html><body>FORGED LEASE TEXT</body></html>" }),
    });

    expect(res.status).toBe(409);
    expect(storedRowData().generatedHtml).toBe(EXECUTED_HTML);
  });

  it("refuses the same forgery from the resident, who also passes the visibility check", async () => {
    state.profile = { email: "jordan.lee@example.com", role: "resident" };
    state.user = { id: "99999999-2222-4333-8444-555555555555", email: "jordan.lee@example.com" };

    const res = await post({
      action: "upsert",
      row: executedRow({ generatedHtml: "<html><body>FORGED LEASE TEXT</body></html>" }),
    });

    expect(res.status).toBe(409);
    expect(storedRowData().generatedHtml).toBe(EXECUTED_HTML);
  });

  it("refuses to swap a signed lease's uploaded PDF for a different one", async () => {
    const pdf = (bytes: string) => ({
      dataUrl: `data:application/pdf;base64,${bytes}`,
      originalDataUrl: `data:application/pdf;base64,${bytes}`,
      fileName: "lease.pdf",
      uploadedAt: "2026-07-01T00:00:00.000Z",
    });
    seedExecuted(executedRow({ generatedHtml: null, managerUploadedPdf: pdf("AAA") }));

    const res = await post({
      action: "upsert",
      row: executedRow({ generatedHtml: null, managerUploadedPdf: pdf("ZZZ") }),
    });

    expect(res.status).toBe(409);
    expect((storedRowData().managerUploadedPdf as Row).originalDataUrl).toContain("AAA");
  });

  it("still accepts the certificate page being merged into the signed PDF", async () => {
    const base = "data:application/pdf;base64,AAA";
    seedExecuted(
      executedRow({
        generatedHtml: null,
        managerUploadedPdf: { dataUrl: base, originalDataUrl: base, fileName: "lease.pdf", uploadedAt: "x" },
      }),
    );

    const res = await post({
      action: "upsert",
      row: executedRow({
        generatedHtml: null,
        managerUploadedPdf: {
          dataUrl: "data:application/pdf;base64,AAAWITHCERT",
          originalDataUrl: base,
          fileName: "lease.pdf",
          uploadedAt: "x",
        },
      }),
    });

    expect(res.status).toBe(200);
    expect((storedRowData().managerUploadedPdf as Row).dataUrl).toContain("WITHCERT");
  });

  it("still accepts a superseding document once the signatures are cleared", async () => {
    const res = await post({
      action: "upsert",
      row: executedRow({
        generatedHtml: "<html><body>RENEWAL LEASE TEXT</body></html>",
        residentSignature: null,
        managerSignature: null,
        status: "Manager Review",
        bucket: "manager",
        fullySignedAt: null,
      }),
    });

    expect(res.status).toBe(200);
    expect(storedRowData().generatedHtml).toContain("RENEWAL");
  });

  it("still accepts ordinary edits that leave the document alone", async () => {
    const res = await post({ action: "upsert", row: executedRow({ notes: "Filed with the county." }) });

    expect(res.status).toBe(200);
    expect(storedRowData().notes).toBe("Filed with the county.");
    expect(storedRowData().generatedHtml).toBe(EXECUTED_HTML);
  });
});
